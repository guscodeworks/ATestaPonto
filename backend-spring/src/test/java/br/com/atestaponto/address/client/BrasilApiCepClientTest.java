package br.com.atestaponto.address.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.http.HttpHeaders.ACCEPT;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.SocketTimeoutException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class BrasilApiCepClientTest {

    private static final String BASE_URL = "http://brasilapi.test";
    private static final String CEP = "01001000";
    private static final String PROVIDER_MARKER =
            "https://internal.example/provider-secret-marker?token=private";

    private MockRestServiceServer server;
    private BrasilApiCepClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        client = new BrasilApiCepClient(builder.build());
    }

    @Test
    void returnsMappedResponseWhenProviderReturnsValid200() {
        String json = """
                {
                  "cep": "01001000",
                  "state": "SP",
                  "city": "Sao Paulo",
                  "neighborhood": "Se",
                  "street": "Praca da Se",
                  "service": "correios",
                  "location": {
                    "coordinates": {
                      "latitude": -23.5505,
                      "longitude": -46.6333
                    }
                  }
                }
                """;

        server.expect(requestTo(BASE_URL + "/api/cep/v2/" + CEP))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header(ACCEPT, MediaType.APPLICATION_JSON_VALUE))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        BrasilApiCepResponse response = client.findByCep(CEP);

        assertNotNull(response);
        assertEquals(CEP, response.cep());
        assertEquals("SP", response.state());
        assertEquals("Sao Paulo", response.city());
        assertEquals("Se", response.neighborhood());
        assertEquals("Praca da Se", response.street());
        assertNotNull(response.location());
        assertNotNull(response.location().coordinates());
        assertEquals(
                new java.math.BigDecimal("-23.5505"),
                response.location().coordinates().latitude());
        server.verify();
    }

    @Test
    void translatesBadRequestWithoutLeakingProviderDetails() {
        server.expect(requestTo(BASE_URL + "/api/cep/v2/" + CEP))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"detail\":\"" + PROVIDER_MARKER + "\"}"));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> client.findByCep(CEP));

        assertSanitized(exception, HttpStatus.BAD_REQUEST, "CEP invalido");
        server.verify();
    }

    @Test
    void translatesNotFoundWithoutLeakingProviderDetails() {
        server.expect(requestTo(BASE_URL + "/api/cep/v2/" + CEP))
                .andRespond(withStatus(HttpStatus.NOT_FOUND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"detail\":\"" + PROVIDER_MARKER + "\"}"));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> client.findByCep(CEP));

        assertSanitized(exception, HttpStatus.NOT_FOUND, "CEP nao encontrado");
        server.verify();
    }

    @Test
    void translatesProviderUnavailableToBadGateway() {
        server.expect(requestTo(BASE_URL + "/api/cep/v2/" + CEP))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"detail\":\"" + PROVIDER_MARKER + "\"}"));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> client.findByCep(CEP));

        assertSanitized(
                exception,
                HttpStatus.BAD_GATEWAY,
                "Servico de consulta de CEP indisponivel");
        server.verify();
    }

    @Test
    void translatesTimeoutWithoutLeakingInternalDetails() {
        server.expect(requestTo(BASE_URL + "/api/cep/v2/" + CEP))
                .andRespond(withException(
                        new SocketTimeoutException(PROVIDER_MARKER)));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> client.findByCep(CEP));

        assertSanitized(
                exception,
                HttpStatus.BAD_GATEWAY,
                "Servico de consulta de CEP indisponivel");
        server.verify();
    }

    @Test
    void rejects200ResponseWhenCepDoesNotMatchRequest() {
        String json = """
                {
                  "cep": "99999999",
                  "state": "SP",
                  "city": "Sao Paulo",
                  "providerDebug": "%s"
                }
                """.formatted(PROVIDER_MARKER);

        server.expect(requestTo(BASE_URL + "/api/cep/v2/" + CEP))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> client.findByCep(CEP));

        assertSanitized(
                exception,
                HttpStatus.BAD_GATEWAY,
                "Servico de consulta de CEP indisponivel");
        server.verify();
    }

    @Test
    void rejects200ResponseWhenRequiredCityIsMissing() {
        String json = """
                {
                  "cep": "01001000",
                  "state": "SP",
                  "providerDebug": "%s"
                }
                """.formatted(PROVIDER_MARKER);

        server.expect(requestTo(BASE_URL + "/api/cep/v2/" + CEP))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> client.findByCep(CEP));

        assertSanitized(
                exception,
                HttpStatus.BAD_GATEWAY,
                "Servico de consulta de CEP indisponivel");
        server.verify();
    }

    private void assertSanitized(
            ResponseStatusException exception,
            HttpStatus expectedStatus,
            String expectedReason) {
        assertEquals(expectedStatus, exception.getStatusCode());
        assertEquals(expectedReason, exception.getReason());
        assertFalse(exception.getMessage().contains(PROVIDER_MARKER));
        assertFalse(exception.getMessage().contains("internal.example"));
        assertFalse(exception.getMessage().contains("token=private"));
    }
}