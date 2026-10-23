package br.com.atestaponto.employee.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization.Context;
import br.com.atestaponto.school.service.SchoolService;
import br.com.atestaponto.service.EmployeeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
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
}
