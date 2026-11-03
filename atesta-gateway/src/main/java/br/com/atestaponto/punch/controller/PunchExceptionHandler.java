package br.com.atestaponto.punch.controller;

import br.com.atestaponto.punch.service.PunchException;
import java.sql.SQLException;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = PunchController.class)
public class PunchExceptionHandler {
    @ExceptionHandler(PunchException.class)
    public ResponseEntity<?> business(PunchException error) {
        return ResponseEntity.status(error.status()).body(Map.of("code", error.code(), "message", error.getMessage()));
    }
    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<?> duplicate(DuplicateKeyException error) {
        return business(new PunchException(409, "CONFLICT", "Registro duplicado de ponto detectado"));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> invalid(HttpMessageNotReadableException error) {
        return business(new PunchException(400, "BAD_REQUEST", "Invalid JSON payload"));
    }
    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    public ResponseEntity<?> database(Exception error) {
        Throwable cause = error;
        while (cause.getCause() != null) cause = cause.getCause();
        if (cause instanceof SQLException sql) {
            switch (sql.getErrorCode()) {
                case 1452, 1364:
                    return business(new PunchException(422, "VALIDATION_ERROR", "Invalid reference or missing required field"));
                case 1451:
                    return business(new PunchException(409, "CONFLICT", "Record is referenced by other resources"));
                case 1406, 1292:
                    return business(new PunchException(422, "VALIDATION_ERROR", "Provided data is invalid or too long"));
                default: break;
            }
        }
        return unexpected(error);
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unexpected(Exception error) {
        return business(new PunchException(500, "INTERNAL_ERROR", "Internal server error"));
    }
}
