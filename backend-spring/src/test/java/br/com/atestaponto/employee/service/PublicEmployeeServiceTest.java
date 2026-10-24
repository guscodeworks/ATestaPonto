package br.com.atestaponto.employee.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
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
import br.com.atestaponto.employee.repository.EmployeeCreateRepository;
import br.com.atestaponto.school.service.SchoolService;
import br.com.atestaponto.service.EmployeeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
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
    private final ObjectMapper json = new ObjectMapper();
    private final PublicEmployeeService service = new PublicEmployeeService(mock(EmployeeService.class),
            mock(SchoolService.class), mock(EmployeeCreateService.class), mock(EmployeeEditService.class), activations,
            admins, authorization, mock(EmployeeWelcomeEmail.class), mock(Validator.class), json, 4);

    private static Context previous(String capability) {
        return new Context(7, capability, List.of(20L), null, null, null);
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
        verify(authorization, never()).authorize(any(), any(), any(), any());
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
        when(authorization.authorize(locked, "funcionario.criar", null, 20L))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso negado"));
        var error = assertThrows(ResponseStatusException.class, fixture::create);
        assertEquals(403, error.getStatusCode().value());
        verify(fixture.transactions).rollback(any());
        verifyNoInteractions(fixture.repository, fixture.mail);
    }

    /** Usa o EmployeeCreateService real com repository e transaction manager mockados. */
    private final class CreateFixture {
        final EmployeeCreateRepository repository = mock(EmployeeCreateRepository.class);
        final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
        final EmployeeWelcomeEmail mail = mock(EmployeeWelcomeEmail.class);
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
