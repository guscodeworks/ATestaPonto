package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsService;
import br.com.atestaponto.punch.service.PunchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCrypt;

/** Teste unitario: credenciais mockadas; QR nunca participa do login, sem MySQL ou Redis. */
class PublicPunchServiceLoginQrTest {
    private static final String PASSWORD = "senha-segura-123";
    private static final String HASH = BCrypt.hashpw(PASSWORD, BCrypt.gensalt("$2b", 10));
    private final ObjectMapper json = new ObjectMapper();
    private final EmployeeCredentialsService credentials = mock(EmployeeCredentialsService.class);
    private final PublicPunchService service = new PublicPunchService(credentials, mock(PunchService.class),
            new EmployeeJwt(json, new MockEnvironment().withProperty("JWT_SECRET", "test-secret-with-at-least-32-characters")),
            json, new MockEnvironment().withProperty("BCRYPT_SALT_ROUNDS", "10"));

    PublicPunchServiceLoginQrTest() {
        when(credentials.login(any())).thenReturn(new EmployeeCredentialsResponse.Authentication(
                new EmployeeCredentialsResponse.AuthenticationEmployee(42, "52998224725", "Ana", "ana@escola.test", true, HASH, false)));
        when(credentials.activeLink(any())).thenReturn(new EmployeeCredentialsResponse.LoginLink(true,
                new EmployeeCredentialsResponse.ActiveLink(7, 10)));
        when(credentials.lastLogin(any())).thenReturn(new EmployeeCredentialsResponse.Change(true));
    }

    private Object login(String password, Cookie... cookies) throws Exception {
        var request = new MockHttpServletRequest();
        if (cookies.length > 0) request.setCookies(cookies);
        return service.login(json.readTree("{\"identificador\":\"ana@escola.test\",\"senha\":\"" + password + "\"}"), request);
    }

    @Test
    void directAccessLogsIn() throws Exception {
        assertEquals(false, ((Map<?, ?>) login(PASSWORD)).get("primeiro_acesso"));
    }

    @Test
    void leftoverQrCookieFromAnyUnitDoesNotBlockLogin() throws Exception {
        var result = (Map<?, ?>) login(PASSWORD, new Cookie("ponto_qr_acesso", "s:qualquer-sessao-de-outra-escola.assinatura"));
        assertEquals(true, result.get("token") instanceof String);
    }

    @Test
    void qrNeverReplacesPassword() {
        assertThrows(PublicPunchService.InvalidLogin.class,
                () -> login("senha-errada-123", new Cookie("ponto_qr_acesso", "s:qualquer.assinatura")));
    }

    @Test
    void qrNeverReplacesActiveLink() {
        when(credentials.activeLink(any())).thenReturn(new EmployeeCredentialsResponse.LoginLink(true, null));
        assertThrows(PublicPunchService.InvalidLogin.class,
                () -> login(PASSWORD, new Cookie("ponto_qr_acesso", "s:qualquer.assinatura")));
    }
}
