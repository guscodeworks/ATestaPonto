package br.com.atestaponto.employee.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization.Context;
import br.com.atestaponto.employee.dto.EmployeeActivationRequest;
import br.com.atestaponto.employee.dto.EmployeeActivationResponse;
import br.com.atestaponto.employee.dto.EmployeeCreateResponse;
import br.com.atestaponto.employee.dto.EmployeeDetailRequest;
import br.com.atestaponto.employee.dto.EmployeeDetailResponse;
import br.com.atestaponto.employee.repository.EmployeeCreateRepository;
import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import br.com.atestaponto.school.service.SchoolService;
import br.com.atestaponto.service.EmployeeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;

/**
 * Teste unitario com mocks: confirma que escritas revalidam o administrador pela variante com lock.
 * A propagacao @Transactional e os locks SELECT ... FOR UPDATE nao sao exercitados sem banco.
 */
class PublicEmployeeServiceTest {

    private final EmployeeActivationService activations = mock(EmployeeActivationService.class);
    private final PublicAdminAuthorization admins = mock(PublicAdminAuthorization.class);
    private final PublicEmployeeAuthorization authorization = mock(PublicEmployeeAuthorization.class);
    private final EmployeeService reads = mock(EmployeeService.class);
    private final EmployeeTemporaryPasswordService temporaryPasswords = mock(EmployeeTemporaryPasswordService.class);
    private final ObjectMapper json = new ObjectMapper();
    private final PublicEmployeeService service = new PublicEmployeeService(reads,
            mock(SchoolService.class), mock(EmployeeCreateService.class), mock(EmployeeEditService.class), activations,
            admins, authorization, temporaryPasswords, mock(Validator.class), json, 4);

    private static Context previous(String capability) {
        return new Context(7, capability, List.of(20L), null, null, null);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void detailIncludesPersistedActiveStateAsBoolean(boolean active) {
        var admin = mock(AdminContextResponse.class);
        when(admins.requireActive(7)).thenReturn(admin);
        when(authorization.authorize(admin, "funcionario.visualizar", 5L, null))
                .thenReturn(new Context(7, "funcionario.visualizar", List.of(20L), null, null,
                        new EmploymentLinkScopeResponse(50, 20, 10L)));
        when(reads.findAdminEmployeeById(new EmployeeDetailRequest(5L, 50L)))
                .thenReturn(new EmployeeDetailResponse(5, "Funcionario teste", "00000000000", "teste@example.invalid",
                        null, active, "PROFESSOR", "07:00", "11:00", "12:00", "16:00"));
        when(temporaryPasswords.metadata(5)).thenReturn(Map.of("primeiro_acesso", true));

        var payload = json.valueToTree(service.find(previous("funcionario.visualizar"), 5)).path("funcionario");

        assertTrue(payload.path("ativo").isBoolean());
        assertEquals(active, payload.path("ativo").booleanValue());
        assertTrue(payload.path("credencial_temporaria").path("primeiro_acesso").booleanValue());
    }

    @Test
    void revokedAccessBlocksDeactivationBeforeWrite() {
        when(admins.requireActiveForUpdate(7)).thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso administrativo indisponivel"));
        var error = assertThrows(ResponseStatusException.class,
                () -> service.activation(previous("funcionario.desativar"), 5, false, json.valueToTree(Map.of("confirmacao", "DESATIVAR"))));
        assertEquals(403, error.getStatusCode().value());
        verify(admins, never()).requireActive(anyLong());
        verifyNoInteractions(authorization, activations);
    }

    @Test
    void writeRejectsContextIssuedForAnotherCapability() {
        assertThrows(ResponseStatusException.class,
                () -> service.activation(previous("funcionario.listar"), 5, false, json.valueToTree(Map.of("confirmacao", "DESATIVAR"))));
        verifyNoInteractions(admins, authorization, activations);
    }

    @Test
    void wrongConfirmationIsRejectedWithoutTouchingAuthorization() {
        assertThrows(ResponseStatusException.class,
                () -> service.activation(previous("funcionario.reativar"), 5, true, json.valueToTree(Map.of("confirmacao", "DESATIVAR"))));
        verifyNoInteractions(admins, activations);
        verifyNoInteractions(authorization);
    }

    @Test
    void activationRevalidatesInWriteTransaction() {
        var locked = mock(AdminContextResponse.class);
        when(admins.requireActiveForUpdate(7)).thenReturn(locked);
        when(authorization.authorizeInWriteTransaction(locked, "funcionario.reativar", 5L, null))
                .thenReturn(new Context(7, "funcionario.reativar", List.of(20L), null, null,
                        new EmploymentLinkScopeResponse(50, 20, 10L)));
        when(activations.changeActivation(anyLong(), anyBoolean(), any()))
                .thenReturn(new EmployeeActivationResponse(5, true, null));
        service.activation(previous("funcionario.reativar"), 5, true, json.valueToTree(Map.of("confirmacao", "REATIVAR")));
        verify(authorization, never()).authorize(any(), any(), any(), any());
        verify(activations).changeActivation(anyLong(), anyBoolean(),
                eq(new EmployeeActivationRequest("REATIVAR", 50L, 20L, 10L)));
    }

    @Test
    void editOutOfScopeIsForbiddenBeforeWrite() {
        var edits = mock(EmployeeEditService.class);
        var editing = new PublicEmployeeService(mock(EmployeeService.class), mock(SchoolService.class),
                mock(EmployeeCreateService.class), edits, activations, admins, authorization,
                mock(EmployeeTemporaryPasswordService.class), mock(Validator.class), json, 4);
        var locked = mock(AdminContextResponse.class);
        when(admins.requireActiveForUpdate(7)).thenReturn(locked);
        when(authorization.authorizeInWriteTransaction(locked, "funcionario.editar", 5L, null))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Operacao fora do escopo administrativo"));
        var error = assertThrows(ResponseStatusException.class,
                () -> editing.edit(previous("funcionario.editar"), 5, json.valueToTree(Map.of("nome", "Maria Silva"))));
        assertEquals(403, error.getStatusCode().value());
        verify(authorization, never()).authorize(any(), any(), any(), any());
        verifyNoInteractions(edits);
    }

    @Test
    void readKeepsReadOnlyAuthorization() {
        var unlocked = mock(AdminContextResponse.class);
        when(admins.requireActive(7)).thenReturn(unlocked);
        when(authorization.authorize(unlocked, "funcionario.visualizar", 5L, null))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Operacao fora do escopo administrativo"));
        var error = assertThrows(ResponseStatusException.class, () -> service.find(previous("funcionario.visualizar"), 5));
        assertEquals(403, error.getStatusCode().value());
        verify(admins, never()).requireActiveForUpdate(anyLong());
        verify(authorization, never()).authorizeInWriteTransaction(any(), any(), any(), any());
    }

    @Test
    void revokedAccessInsideCreationTransactionBlocksInsertAndEmail() {
        var fixture = new CreateFixture();
        when(admins.requireActiveForUpdate(7)).thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso administrativo indisponivel"));
        var error = assertThrows(ResponseStatusException.class, fixture::create);
        assertEquals(403, error.getStatusCode().value());
        var order = inOrder(admins, fixture.transactions);
        order.verify(admins).requireActive(7);
        order.verify(fixture.transactions).getTransaction(any());
        order.verify(admins).requireActiveForUpdate(7);
        order.verify(fixture.transactions).rollback(any());
        verifyNoInteractions(fixture.repository, fixture.mail);
    }

    @Test
    void scopeChangedInsideCreationTransactionBlocksInsertAndEmail() {
        var fixture = new CreateFixture();
        var locked = mock(AdminContextResponse.class);
        when(admins.requireActiveForUpdate(7)).thenReturn(locked);
        when(authorization.authorizeInWriteTransaction(locked, "funcionario.criar", null, 20L))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso negado"));
        var error = assertThrows(ResponseStatusException.class, fixture::create);
        assertEquals(403, error.getStatusCode().value());
        verify(authorization, never()).authorize(eq(locked), any(), any(), any());
        verify(fixture.transactions).rollback(any());
        verifyNoInteractions(fixture.repository, fixture.mail);
    }

    @Test
    void creationCommitsBeforeDeliveryWithTheExpiryCapturedInTheTransaction() {
        var fixture = new CreateFixture();
        var locked = mock(AdminContextResponse.class);
        when(admins.requireActiveForUpdate(7)).thenReturn(locked);
        when(authorization.authorizeInWriteTransaction(locked, "funcionario.criar", null, 20L))
                .thenReturn(new Context(7, "funcionario.criar", List.of(20L), 20L, 3L, null));
        when(fixture.repository.lockAuthorizedSchoolUnit(20, 3)).thenReturn(true);
        when(fixture.repository.insertEmployee(any(), any(), any(), any(), eq(true))).thenReturn(5L);
        when(fixture.repository.findCreatedEmployee(5)).thenReturn(new EmployeeCreateResponse(
                5L, "52998224725", "Maria Silva", "maria@example.com", null, true,
                "2026-11-03T12:00:00Z", true, 1L, "PROFESSOR", "2026-11-10T12:00:00Z"));
        when(fixture.mail.delivery(any(), any(), any(), any())).thenReturn(Map.of("email_acesso", Map.of("estado", "desativado")));

        fixture.create();

        var order = inOrder(fixture.transactions, fixture.mail);
        order.verify(fixture.transactions).commit(any());
        order.verify(fixture.mail).delivery(eq("Maria Silva"), eq("maria@example.com"), any(), eq("2026-11-10T12:00:00Z"));
        var hash = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(fixture.repository).insertLogin(eq(5L), hash.capture());
        var password = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(fixture.mail).delivery(any(), any(), password.capture(), any());
        org.junit.jupiter.api.Assertions.assertTrue(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4)
                .matches(password.getValue(), hash.getValue()));
    }

    /** Usa o EmployeeCreateService real com repository e transaction manager mockados. */
    private final class CreateFixture {
        final EmployeeCreateRepository repository = mock(EmployeeCreateRepository.class);
        final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
        final EmployeeTemporaryPasswordService mail = mock(EmployeeTemporaryPasswordService.class);
        final PublicEmployeeService service;

        CreateFixture() {
            var validator = mock(Validator.class);
            when(validator.validate(any())).thenReturn(java.util.Set.of());
            service = new PublicEmployeeService(mock(EmployeeService.class), mock(SchoolService.class),
                    new EmployeeCreateService(repository, transactions), mock(EmployeeEditService.class), activations,
                    admins, authorization, mail, validator, json, 4);
            var unlocked = mock(AdminContextResponse.class);
            when(admins.requireActive(7)).thenReturn(unlocked);
            when(authorization.authorize(unlocked, "funcionario.criar", null, 20L))
                    .thenReturn(new Context(7, "funcionario.criar", List.of(20L), 20L, 3L, null));
        }

        void create() {
            service.create(previous("funcionario.criar"), json.valueToTree(Map.of("nome", "Maria Silva",
                    "cpf", "52998224725", "email", "maria@example.com", "ativo", true, "unidade_escolar_id", 20,
                    "cargo", "PROFESSOR", "entrada", "07:00", "saida_almoco", "11:00", "retorno_almoco", "12:00",
                    "saida", "16:00")));
        }
    }
}
