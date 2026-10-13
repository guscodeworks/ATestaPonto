package br.com.atestaponto.schoolqr.controller;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = SchoolQrController.class)
public class SchoolQrExceptionHandler {
    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<?> invalid(Exception error) {
        return ResponseEntity.badRequest().body(Map.of("code", "BAD_REQUEST", "message", "unidade_escolar_id invalido"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unavailable(Exception error) {
        return ResponseEntity.status(503).body(Map.of("code", "SCHOOL_QR_SERVICE_UNAVAILABLE",
                "message", "Servico de QR escolar indisponivel"));
    }
}
