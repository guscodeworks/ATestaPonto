package br.com.atestaponto.publicpunch.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.atestaponto.publicpunch.service.LoginFailureDelay;
import br.com.atestaponto.publicpunch.service.PublicPasswordRecovery;
import br.com.atestaponto.publicpunch.service.PublicPunchException;
import br.com.atestaponto.publicpunch.service.PublicPunchRateLimit;
import br.com.atestaponto.publicpunch.service.PublicPunchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Teste unitario: servico e limites mockados; sem Spring Security, MySQL ou Redis. */
class PublicPunchControllerLoginTest {
    private final ObjectMapper json = new ObjectMapper();
    private final PublicPunchService punches = mock(PublicPunchService.class);
    private final PublicPunchRateLimit limits = mock(PublicPunchRateLimit.class);
    private final LoginFailureDelay delay = new LoginFailureDelay(new MockEnvironment().withProperty("LOGIN_FAILURE_DELAY_MS", "200"));
    private final PublicPunchErrors errors = new PublicPunchErrors(new MockEnvironment());
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new PublicPunchController(punches, mock(PublicPasswordRecovery.class),
            limits, mock(AsyncTaskExecutor.class), delay)).setControllerAdvice(errors).build();

    @AfterEach
    void stop() { delay.destroy(); }

    private MvcResult login() throws Exception {
        return mvc.perform(post("/api/pontos/login").requestAttr("publicPunchBody", json.readTree("{\"identificador\":\"x\"}"))).andReturn();
    }

    private String expected(PublicPunchException e) throws Exception { return json.writeValueAsString(errors.business(e).getBody()); }

    @Test
    void invalidLoginIsDelayedAsynchronouslyWithSameResponse() throws Exception {
        when(punches.login(any(), any(), any())).thenThrow(new PublicPunchService.InvalidLogin());
        long started = System.nanoTime();
        var result = mvc.perform(post("/api/pontos/login").requestAttr("publicPunchBody", json.readTree("{\"identificador\":\"x\"}")))
                .andExpect(request().asyncStarted()).andReturn();
        // Falha contabilizada antes da espera.
        verify(limits).loginFinished(eq("invalid"), any(), eq(false), any());
        mvc.perform(asyncDispatch(result)).andExpect(status().isUnauthorized())
                .andExpect(content().json(expected(new PublicPunchException(401, "UNAUTHORIZED", "CPF/email ou senha invalidos")), true));
        if (System.nanoTime() - started < 200_000_000L) throw new AssertionError("resposta antes do atraso");
    }

    @Test
    void successRespondsWithSameBody() throws Exception {
        when(punches.login(any(), any(), any())).thenReturn(Map.of("token", "t"));
        mvc.perform(asyncDispatch(login())).andExpect(status().isOk())
                .andExpect(content().json("{\"success\":true,\"data\":{\"token\":\"t\"}}", true));
        verify(limits).loginFinished(eq("invalid"), any(), eq(true), any());
    }

    @Test
    void otherErrorsStaySynchronous() throws Exception {
        var unavailable = new PublicPunchException(503, "SERVICE_UNAVAILABLE", "x");
        when(punches.login(any(), any(), any())).thenThrow(unavailable);
        mvc.perform(post("/api/pontos/login").requestAttr("publicPunchBody", json.readTree("{\"identificador\":\"x\"}")))
                .andExpect(request().asyncNotStarted()).andExpect(status().isServiceUnavailable())
                .andExpect(content().json(expected(unavailable), true));
        verify(limits).loginFinished(eq("invalid"), any(), eq(false), any());
    }
}
