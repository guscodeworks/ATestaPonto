package br.com.atestaponto.employee.controller;

import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = EmployeeCreateController.class)
public class EmployeeCreationExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> status(ResponseStatusException error) {
        int status = error.getStatusCode().value();
        String code = status == 404 ? "NOT_FOUND" : status == 409 ? "CONFLICT"
                : status == 400 ? "BAD_REQUEST" : "EMPLOYEE_CREATE_ERROR";
        return ResponseEntity.status(error.getStatusCode()).body(Map.of(
                "code", code, "message", error.getReason() == null ? "Cadastro invalido" : error.getReason()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String, String>> invalid(Exception error) {
        return ResponseEntity.badRequest().body(Map.of(
                "code", "BAD_REQUEST", "message", "Dados do funcionario invalidos"));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> databaseFailure(DataAccessException error) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "code", "DATABASE_ERROR", "message", "Nao foi possivel criar funcionario"));
    }
}
