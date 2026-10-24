package br.com.atestaponto.adminaccess.controller;

import br.com.atestaponto.adminaccess.dto.PublicAccessInput;
import br.com.atestaponto.adminaccess.service.AdminAccessException;
import br.com.atestaponto.cargo.controller.PublicCargoController;
import br.com.atestaponto.schoolqr.controller.PublicSchoolQrController;
import br.com.atestaponto.schoolqr.service.PublicSchoolQrService;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.SQLException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = {PublicAdminAccessController.class, PublicCargoController.class, PublicSchoolQrController.class})
public class PublicAccessExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(PublicAccessExceptionHandler.class);
    @ExceptionHandler(PublicAccessInput.Invalid.class)
    public ResponseEntity<?> validation(PublicAccessInput.Invalid error) {
        return failure(422, "VALIDATION_ERROR", error.getMessage(), error.details());
    }

    @ExceptionHandler(AdminAccessException.class)
    public ResponseEntity<?> business(AdminAccessException error) {
        return failure(error.status(), error.code(), error.getMessage(),
                error instanceof PublicSchoolQrService.Ambiguous ambiguous ? ambiguous.details() : Map.of());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<?> status(ResponseStatusException error) {
        int status = error.getStatusCode().value();
        return failure(status, status == 403 ? "FORBIDDEN" : "BAD_REQUEST", error.getReason(), Map.of());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> json(Exception error) { return failure(400, "BAD_REQUEST", "Invalid JSON payload", Map.of()); }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    public ResponseEntity<?> database(Exception error, HttpServletRequest request) {
        if (!request.getServletPath().startsWith("/api/admin/acessos")) return unavailable(error, request);
        if (error instanceof DuplicateKeyException) return failure(409, "CONFLICT", "Duplicate record detected", Map.of());
        Throwable cause = error;
        while (cause.getCause() != null) cause = cause.getCause();
        if (cause instanceof SQLException sql) {
            switch (sql.getErrorCode()) {
                case 1452, 1364: return failure(422, "VALIDATION_ERROR", "Invalid reference or missing required field", Map.of());
                case 1451: return failure(409, "CONFLICT", "Record is referenced by other resources", Map.of());
                case 1406, 1292: return failure(422, "VALIDATION_ERROR", "Provided data is invalid or too long", Map.of());
                default: break;
            }
        }
        return unexpected(error, 500, "INTERNAL_ERROR");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unavailable(Exception error, HttpServletRequest request) {
        if (request.getServletPath().startsWith("/api/admin/qr-tokens")) return unexpected(error, 502, "SCHOOL_QR_SERVICE_UNAVAILABLE");
        if (request.getServletPath().startsWith("/api/admin/cargos")) return unexpected(error, 502, "CARGO_READ_SERVICE_UNAVAILABLE");
        return unexpected(error, 500, "INTERNAL_ERROR");
    }

    private static ResponseEntity<?> unexpected(Exception error, int status, String code) {
        // Somente o tipo: mensagem, causa e stack podem conter CPF, e-mail ou tokens.
        LOG.error("falha_inesperada codigo={} status={} excecao={}", code, status, error.getClass().getName());
        return failure(status, code, "Internal server error", Map.of());
    }

    private static ResponseEntity<?> failure(int status, String code, String message, Object details) {
        return ResponseEntity.status(status).body(Map.of("success", false,
                "error", Map.of("code", code, "message", message == null ? "Request error" : message, "details", details)));
    }
}
