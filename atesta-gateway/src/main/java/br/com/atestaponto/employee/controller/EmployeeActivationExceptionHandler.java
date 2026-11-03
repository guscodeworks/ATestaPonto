package br.com.atestaponto.employee.controller;

import java.sql.SQLException;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = EmployeeActivationController.class)
public class EmployeeActivationExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> status(ResponseStatusException error) {
        int status = error.getStatusCode().value();
        String code = status == 404 ? "NOT_FOUND" : status == 409 ? "CONFLICT"
                : status == 400 ? "BAD_REQUEST" : "EMPLOYEE_ACTIVATION_ERROR";
        return ResponseEntity.status(status).body(Map.of("code", code,
                "message", error.getReason() == null ? "Ativacao invalida" : error.getReason()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, String>> invalid(Exception error) {
        return ResponseEntity.badRequest().body(Map.of(
                "code", "BAD_REQUEST", "message", "Dados do funcionario invalidos"));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> databaseFailure(DataAccessException error) {
        if (error.getMostSpecificCause() instanceof SQLException sql) {
            if (sql.getErrorCode() == 1406 || sql.getErrorCode() == 1292) {
                return ResponseEntity.unprocessableEntity().body(Map.of("code", "VALIDATION_ERROR",
                        "message", "Provided data is invalid or too long"));
            }
            if (sql.getErrorCode() == 1452 || sql.getErrorCode() == 1364) {
                return ResponseEntity.unprocessableEntity().body(Map.of("code", "VALIDATION_ERROR",
                        "message", "Invalid reference or missing required field"));
            }
        }
        return ResponseEntity.internalServerError().body(Map.of(
                "code", "DATABASE_ERROR", "message", "Nao foi possivel alterar ativacao do funcionario"));
    }
}
