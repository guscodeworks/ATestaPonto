package br.com.atestaponto.report.controller;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = PublicReportController.class)
public class PublicReportExceptionHandler {
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
        return failure(502, "REPORT_SERVICE_UNAVAILABLE", "Internal server error");
    }

    private ResponseEntity<?> failure(int status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("success", false,
                "error", Map.of("code", code, "message", message, "details", Map.of())));
    }
}
