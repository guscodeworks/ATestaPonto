package br.com.atestaponto.employee.controller;

import java.sql.SQLException;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = PublicEmployeeController.class)
public class PublicEmployeeExceptionHandler {
    @ExceptionHandler(br.com.atestaponto.employee.dto.PublicEmployeeInput.Invalid.class)
    public ResponseEntity<?> validation(br.com.atestaponto.employee.dto.PublicEmployeeInput.Invalid error) {
        return ResponseEntity.unprocessableEntity().body(Map.of("success", false,
                "error", Map.of("code", "VALIDATION_ERROR", "message", error.getReason(), "details", error.details())));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<?> status(ResponseStatusException error) {
        int status = error.getStatusCode().value();
        String code = switch (status) {
            case 400 -> "BAD_REQUEST";
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";
            case 409 -> "CONFLICT";
            case 422 -> "VALIDATION_ERROR";
            default -> "INTERNAL_ERROR";
        };
        return failure(status, code, status >= 500 ? "Internal server error" : error.getReason());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<?> invalid(Exception error) {
        return failure(400, "BAD_REQUEST", "Dados de requisicao invalidos");
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<?> database(DataAccessException error, HttpServletRequest request) {
        if (request.getMethod().equals("GET") || request.getMethod().equals("POST")) return unavailable(request);
        if (error.getMostSpecificCause() instanceof SQLException sql) {
            if (sql.getErrorCode() == 1406 || sql.getErrorCode() == 1292) {
                return failure(422, "VALIDATION_ERROR", "Provided data is invalid or too long");
            }
            if (sql.getErrorCode() == 1452 || sql.getErrorCode() == 1364) {
                return failure(422, "VALIDATION_ERROR", "Invalid reference or missing required field");
            }
        }
        return failure(500, "INTERNAL_ERROR", "Internal server error");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unexpected(Exception error, HttpServletRequest request) {
        if (request.getMethod().equals("GET") || request.getMethod().equals("POST")
                || !request.getServletPath().matches(".*/(desativar|reativar)/?")) return unavailable(request);
        return failure(500, "INTERNAL_ERROR", "Internal server error");
    }

    private ResponseEntity<?> unavailable(HttpServletRequest request) {
        String code = request.getServletPath().matches(".*/unidades/?") ? "SCHOOL_SERVICE_UNAVAILABLE"
                : request.getMethod().equals("GET") ? "EMPLOYEE_READ_SERVICE_UNAVAILABLE"
                : request.getMethod().equals("POST") ? "EMPLOYEE_CREATE_SERVICE_UNAVAILABLE"
                : "EMPLOYEE_EDIT_SERVICE_UNAVAILABLE";
        return failure(502, code, "Internal server error");
    }

    private ResponseEntity<?> failure(int status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("success", false,
                "error", Map.of("code", code, "message", message == null ? "Request error" : message, "details", Map.of())));
    }
}
