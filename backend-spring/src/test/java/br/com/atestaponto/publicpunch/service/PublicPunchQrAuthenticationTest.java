package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsService;
import br.com.atestaponto.punch.service.PunchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.mock.web.MockHttpServletRequest;

class PublicPunchQrAuthenticationTest {
    @Test
    void qrQueryParameterAloneDoesNotAuthenticateEmployee() {
        var credentials = mock(EmployeeCredentialsService.class);
        var punches = mock(PunchService.class);
        var jwt = mock(EmployeeJwt.class);
        var environment = mock(Environment.class);

        when(environment.getProperty(
                eq("BCRYPT_SALT_ROUNDS"), eq(Integer.class), eq(12)))
                .thenReturn(10);
        when(environment.getProperty(
                eq("LOGIN_FAILURE_DELAY_MS"), eq(Long.class), eq(2000L)))
                .thenReturn(0L);

        var service = new PublicPunchService(
                credentials, punches, jwt, new ObjectMapper(), environment);

        var request = new MockHttpServletRequest("GET", "/api/pontos/hoje");
        request.setParameter("qr", "a".repeat(64));

        PublicPunchException error = assertThrows(
                PublicPunchException.class,
                () -> service.authenticate(request));

        assertEquals(401, error.status());
        assertEquals("UNAUTHORIZED", error.code());
        verifyNoInteractions(credentials, punches, jwt);
    }
}
