package br.com.atestaponto.adminaccess.controller;

import br.com.atestaponto.adminaccess.service.AdminAccessException;
import java.sql.SQLException;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = AdminAccessController.class)
public class AdminAccessExceptionHandler {
    @ExceptionHandler(AdminAccessException.class)
    public ResponseEntity<?> business(AdminAccessException error) {
        return ResponseEntity.status(error.status()).body(Map.of("code", error.code(), "message", error.getMessage()));
    }
    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<?> duplicate(DuplicateKeyException error) {
        return business(new AdminAccessException(409, "CONFLICT", "Duplicate record detected"));
    }
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class})
    public ResponseEntity<?> invalid(Exception error) {
        return business(new AdminAccessException(400, "BAD_REQUEST", "Dados de acesso administrativo invalidos"));
    }
    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    public ResponseEntity<?> database(Exception error) {
        Throwable cause = error;
        while (cause.getCause() != null) cause = cause.getCause();
        if (cause instanceof SQLException sql) {
            switch (sql.getErrorCode()) {
                case 1452, 1364:
                    return business(new AdminAccessException(422, "VALIDATION_ERROR", "Invalid reference or missing required field"));
                case 1451:
                    return business(new AdminAccessException(409, "CONFLICT", "Record is referenced by other resources"));
                case 1406, 1292:
                    return business(new AdminAccessException(422, "VALIDATION_ERROR", "Provided data is invalid or too long"));
                default: break;
            }
        }
        return unexpected(error);
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unexpected(Exception error) {
        return business(new AdminAccessException(500, "INTERNAL_ERROR", "Internal server error"));
    }
}
