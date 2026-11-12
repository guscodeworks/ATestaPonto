package br.com.atestaponto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.atestaponto.adminaccess.controller.PublicAccessExceptionHandler;
import br.com.atestaponto.employee.controller.PublicEmployeeExceptionHandler;
import br.com.atestaponto.publicpunch.controller.PublicPunchErrors;
import br.com.atestaponto.report.controller.PublicReportExceptionHandler;
import br.com.atestaponto.school.controller.PublicSchoolExceptionHandler;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.SQLException;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

/** Teste unitario dos handlers publicos: o log de falha inesperada nao pode carregar dados sensiveis. */
class PublicErrorLogTest {

    private static final String CPF = "123.456.789-09";
    private static final String SECRET = "cpf=" + CPF + " email=fulano@exemplo.gov.br senha=S3nh@ token=eyJhbGciOiJIUzI1NiJ9.segredo";
    private static final List<String> SENSITIVE = List.of(CPF, "12345678909", "fulano@exemplo.gov.br", "S3nh@", "eyJhbGci", "segredo");

    private final ObjectMapper json = new ObjectMapper();

    private static IllegalStateException sensitive() {
        return new IllegalStateException(SECRET, new SQLException("Duplicate entry '12345678909' for key 'cpf'"));
    }

    private static MockHttpServletRequest request(String method, String path) {
        var request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        request.setParameter("cpf", "12345678909");
        request.addHeader("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.segredo");
        request.setContent(("{\"email\":\"fulano@exemplo.gov.br\",\"senha\":\"S3nh@\"}").getBytes());
        return request;
    }

    private ILoggingEvent logged(Class<?> handler, Supplier<ResponseEntity<?>> call, int status, String code) {
        var logger = (Logger) LoggerFactory.getLogger(handler);
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        try {
            var response = call.get();
            var body = json.valueToTree(response.getBody());
            assertEquals(status, response.getStatusCode().value());
            assertEquals(code, body.at("/error/code").asText());
            assertEquals("Internal server error", body.at("/error/message").asText());
        } finally {
            logger.detachAppender(appender);
        }
        assertEquals(1, appender.list.size());
        var event = appender.list.get(0);
        String message = event.getFormattedMessage();
        assertEquals("falha_inesperada codigo=" + code + " status=" + status + " excecao=", message.substring(0, message.lastIndexOf('=') + 1));
        assertNull(event.getThrowableProxy(), "stack trace e causa nao devem ser registrados");
        for (String value : SENSITIVE) assertFalse(message.contains(value), () -> "log expos: " + value);
        return event;
    }

    @Test
    void reportLogsOnlyEventAndExceptionType() {
        var event = logged(PublicReportExceptionHandler.class,
                () -> new PublicReportExceptionHandler().unavailable(sensitive()), 502, "REPORT_SERVICE_UNAVAILABLE");
        assertTrue(event.getFormattedMessage().endsWith("excecao=java.lang.IllegalStateException"));
    }

    @Test
    void accessLogsWithoutSensitiveData() {
        logged(PublicAccessExceptionHandler.class, () -> new PublicAccessExceptionHandler()
                .unavailable(sensitive(), request("GET", "/api/admin/cargos")), 502, "CARGO_READ_SERVICE_UNAVAILABLE");
        logged(PublicAccessExceptionHandler.class, () -> new PublicAccessExceptionHandler()
                .database(new DataAccessResourceFailureException(SECRET, sensitive()), request("POST", "/api/admin/acessos")),
                500, "INTERNAL_ERROR");
    }

    @Test
    void employeeLogsWithoutSensitiveData() {
        logged(PublicEmployeeExceptionHandler.class, () -> new PublicEmployeeExceptionHandler()
                .unexpected(sensitive(), request("POST", "/api/admin/funcionarios")), 502, "EMPLOYEE_CREATE_SERVICE_UNAVAILABLE");
        logged(PublicEmployeeExceptionHandler.class, () -> new PublicEmployeeExceptionHandler()
                .status(new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, SECRET, sensitive())), 500, "INTERNAL_ERROR");
    }

    @Test
    void schoolLogsWithoutSensitiveData() {
        logged(PublicSchoolExceptionHandler.class, () -> new PublicSchoolExceptionHandler()
                .unavailable(sensitive(), request("GET", "/api/admin/escolas")), 502, "SCHOOL_SERVICE_UNAVAILABLE");
        logged(PublicSchoolExceptionHandler.class, () -> new PublicSchoolExceptionHandler()
                .status(new ResponseStatusException(HttpStatus.BAD_GATEWAY, SECRET, sensitive()), request("GET", "/api/admin/escolas/cep/01001000")),
                502, "CEP_INDISPONIVEL");
    }

    @Test
    void punchLogsWithoutSensitiveData() {
        logged(PublicPunchErrors.class, () -> new PublicPunchErrors(new MockEnvironment())
                .database(new DataAccessResourceFailureException(SECRET, sensitive())), 500, "INTERNAL_ERROR");
    }
}
