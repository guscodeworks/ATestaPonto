package br.com.atestaponto.report.controller;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = PublicReportController.class)
public class PublicReportExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(PublicReportExceptionHandler.class);
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<?> status(ResponseStatusException error) {
        int status = error.getStatusCode().value();
        if (status == 400 || status == 403) {
            return failure(status, status == 400 ? "BAD_REQUEST" : "FORBIDDEN", error.getReason());
        }
        return unavailable(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unavailable(Exception error) {
        // Somente o tipo: mensagem, causa e stack podem conter CPF, e-mail ou tokens.
        LOG.error("falha_inesperada codigo={} status={} excecao={}", "REPORT_SERVICE_UNAVAILABLE", 502, error.getClass().getName());
        return failure(502, "REPORT_SERVICE_UNAVAILABLE", "Internal server error");
    }

    private ResponseEntity<?> failure(int status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("success", false,
                "error", Map.of("code", code, "message", message, "details", Map.of())));
    }
}
