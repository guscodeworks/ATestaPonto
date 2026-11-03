package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository.Credential;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsException;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsService;
import br.com.atestaponto.publicpunch.controller.PublicPunchErrors;
import br.com.atestaponto.punch.service.PunchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;

/** Teste unitario: repositorio mockado; regra de estado real do EmployeeCredentialsService, sem MySQL ou Redis. */
class PublicPunchServiceFirstAccessTest {
    private final ObjectMapper json = new ObjectMapper();
    private final EmployeeJwt jwt = new EmployeeJwt(json, new MockEnvironment().withProperty("JWT_SECRET", "test-secret-with-at-least-32-characters"));
    private final EmployeeCredentialsRepository repository = mock(EmployeeCredentialsRepository.class);
    private final PublicPunchService service = new PublicPunchService(new EmployeeCredentialsService(repository), mock(PunchService.class),
            jwt, json, new MockEnvironment().withProperty("BCRYPT_SALT_ROUNDS", "10"));
    private final PublicPunchErrors errors = new PublicPunchErrors(new MockEnvironment());

    private Object change() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + jwt.issue(42, null, true));
        return service.firstAccess(json.readTree("{\"novaSenha\":\"nova-senha-segura\"}"), request);
    }

    @Test
    void firstUseUpdatesPassword() throws Exception {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, true));
        when(repository.updatePassword(eq(42L), anyString(), eq(true))).thenReturn(1);
        assertEquals(false, ((java.util.Map<?, ?>) change()).get("primeiro_acesso"));
        verify(repository).updatePassword(eq(42L), anyString(), eq(true));
    }

    @Test
    void reuseAfterCompletionIsConflictAndDoesNotWrite() throws Exception {
        when(repository.lockCredential(42)).thenReturn(new Credential(true, false));
        var error = assertThrows(EmployeeCredentialsException.class, this::change);
        assertEquals(409, error.status());
        assertEquals("CONFLICT", error.code());
        var response = errors.credentials(error);
        assertEquals(409, response.getStatusCode().value());
        assertEquals(json.readTree("{\"success\":false,\"error\":{\"code\":\"CONFLICT\",\"message\":\"O primeiro acesso ja foi concluido\",\"details\":{}}}"),
                json.valueToTree(response.getBody()));
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }

    @Test
    void serviceFailureIsBadGateway() {
        when(repository.lockCredential(42)).thenThrow(new DataAccessResourceFailureException("down"));
        var error = assertThrows(PublicPunchException.class, this::change);
        assertEquals(502, error.status());
        assertEquals("EMPLOYEE_CREDENTIALS_SERVICE_UNAVAILABLE", error.code());
        assertEquals(502, errors.business(error).getStatusCode().value());
        verify(repository, never()).updatePassword(anyLong(), anyString(), anyBoolean());
    }
}
