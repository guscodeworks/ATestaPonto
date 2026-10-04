package br.com.atestaponto.address.controller;

import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = AddressController.class)
public class AddressExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ProblemDetail> handle(ResponseStatusException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                exception.getStatusCode(), exception.getReason());
        return ResponseEntity.status(exception.getStatusCode()).body(problem);
    }
}
