package br.com.atestaponto.publicpunch.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import br.com.atestaponto.publicpunch.service.PublicPunchException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletResponse;

/** Teste unitario do formato de erro; nao passa pelo DispatcherServlet. */
class PublicPunchErrorsTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void businessErrorKeepsStandardEnvelope() throws Exception {
        var response = new PublicPunchErrors(new MockEnvironment()).business(new PublicPunchException(401, "UNAUTHORIZED", "Sessao expirada"));
        var body = json.valueToTree(response.getBody());
        assertEquals(401, response.getStatusCode().value());
        assertFalse(body.get("success").asBoolean());
        assertEquals("UNAUTHORIZED", body.at("/error/code").asText());
        assertEquals("Sessao expirada", body.at("/error/message").asText());
        assertEquals(0, body.at("/error/details").size());
    }

    @Test
    void legacyPunchRateLimitOmitsDetails() throws Exception {
        var response = new MockHttpServletResponse();
        PublicPunchErrors.write(response, json, new PublicPunchException(429, "RATE_LIMITED", "Muitas requisicoes"), true);
        var body = json.readTree(response.getContentAsByteArray());
        assertEquals(429, response.getStatus());
        assertEquals("RATE_LIMITED", body.at("/error/code").asText());
        assertFalse(body.get("error").has("details"));
    }

    @Test
    void unexpectedErrorDoesNotLeakMessage() {
        var body = json.valueToTree(new PublicPunchErrors(new MockEnvironment()).unexpected(new IllegalStateException("segredo")).getBody());
        assertEquals("INTERNAL_ERROR", body.at("/error/code").asText());
        assertEquals("Internal server error", body.at("/error/message").asText());
    }
}
