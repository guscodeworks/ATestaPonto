package br.com.atestaponto.employeecredentials.controller;

import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsException;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = EmployeeCredentialsController.class)
public class EmployeeCredentialsExceptionHandler {
    @ExceptionHandler(EmployeeCredentialsException.class)
    public ResponseEntity<?> business(EmployeeCredentialsException error) {
        return ResponseEntity.status(error.status()).body(Map.of("code", error.code(), "message", error.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> invalid(HttpMessageNotReadableException error) {
        return business(new EmployeeCredentialsException(400, "BAD_REQUEST", "Requisicao de credenciais invalida"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unexpected(Exception error) {
        return business(new EmployeeCredentialsException(500, "INTERNAL_ERROR", "Internal server error"));
    }
}
