package br.com.atestaponto.internal;

import br.com.atestaponto.address.controller.AddressController;
import br.com.atestaponto.educationdepartment.controller.EducationDepartmentController;
import br.com.atestaponto.school.controller.SchoolCreationController;
import br.com.atestaponto.school.controller.SchoolPreviewController;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

// ProblemDetail interno repassado pelo gateway; erros de dominio seguem nos handlers de cada controller.
@RestControllerAdvice(assignableTypes = {AddressController.class, EducationDepartmentController.class,
        SchoolCreationController.class, SchoolPreviewController.class})
public class InternalProblemDetailHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ProblemDetail> handle(ResponseStatusException exception) {
        return ResponseEntity.of(exception.getBody()).build();
    }
}
