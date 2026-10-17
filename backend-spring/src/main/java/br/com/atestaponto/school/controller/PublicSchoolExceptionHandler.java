package br.com.atestaponto.school.controller;

import br.com.atestaponto.educationdepartment.controller.PublicEducationDepartmentController;
import br.com.atestaponto.school.dto.PublicSchoolInput;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = {PublicSchoolController.class, PublicEducationDepartmentController.class})
public class PublicSchoolExceptionHandler {
    @ExceptionHandler(PublicSchoolInput.Invalid.class)
    public ResponseEntity<?> validation(PublicSchoolInput.Invalid error) {
        return failure(422, "VALIDATION_ERROR", error.getReason(), error.details());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<?> status(ResponseStatusException error, HttpServletRequest request) {
        int status = error.getStatusCode().value();
        if (schoolWrite(request) && status != 403) {
            return schoolProblem(status, error.getReason(), request);
        }
        if (request.getServletPath().matches("/api/admin/escolas/cep/[^/]+/?")) {
            if (status == 404) return failure(404, "CEP_NAO_ENCONTRADO", "CEP nao encontrado na base de consulta");
            if (status == 400) return failure(422, "VALIDATION_ERROR", "CEP invalido",
                    java.util.List.of(Map.of("field", "cep", "location", "body", "message", "CEP deve ter 8 digitos validos")));
            if (status >= 500) return failure(502, "CEP_INDISPONIVEL", "Internal server error");
        }
        String code = switch (status) {
            case 400 -> "BAD_REQUEST";
            case 403 -> "FORBIDDEN";
            case 404 -> "EDUCATION_DEPARTMENT_ERROR";
            case 409 -> "EDUCATION_DEPARTMENT_CONFLICT";
            default -> "INTERNAL_ERROR";
        };
        return failure(status, code, status >= 500 ? "Internal server error" : error.getReason());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> invalid(Exception error) {
        return failure(400, "BAD_REQUEST", "Invalid JSON payload");
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<?> duplicate(DuplicateKeyException error, HttpServletRequest request) {
        if (schoolWrite(request)) return unavailable(error, request);
        return failure(409, "EDUCATION_DEPARTMENT_CONFLICT",
                "Ja existe uma DRE com este nome ou codigo, inclusive entre as inativas");
    }

    @ExceptionHandler({DataAccessException.class, Exception.class})
    public ResponseEntity<?> unavailable(Exception error, HttpServletRequest request) {
        if (schoolWrite(request) && error instanceof DataAccessException && !request.getServletPath().matches(".*/preview/?")) {
            return schoolProblem(500, "Nao foi possivel criar a unidade escolar", request);
        }
        String code = request.getServletPath().startsWith("/api/admin/diretorias")
                ? "EDUCATION_DEPARTMENT_ERROR"
                : request.getServletPath().matches("/api/admin/escolas/diretorias/?")
                ? "EDUCATION_DEPARTMENT_SERVICE_UNAVAILABLE" : "SCHOOL_SERVICE_UNAVAILABLE";
        return failure(502, code, "Internal server error");
    }

    private ResponseEntity<?> schoolProblem(int status, String detail, HttpServletRequest request) {
        var problem = ProblemDetail.forStatusAndDetail(org.springframework.http.HttpStatusCode.valueOf(status), detail);
        // O Express encaminha o ProblemDetail interno sem alterar o instance.
        problem.setInstance(java.net.URI.create(request.getServletPath().matches(".*/preview/?")
                ? "/internal/escolas/preview" : "/internal/escolas"));
        return ResponseEntity.status(status).contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(problem);
    }

    private boolean schoolWrite(HttpServletRequest request) {
        return request.getMethod().equals("POST") && request.getServletPath().startsWith("/api/admin/escolas");
    }

    private ResponseEntity<?> failure(int status, String code, String message) {
        return failure(status, code, message, Map.of());
    }

    private ResponseEntity<?> failure(int status, String code, String message, Object details) {
        return ResponseEntity.status(status).body(Map.of("success", false,
                "error", Map.of("code", code, "message", message == null ? "Request error" : message, "details", details)));
    }
}
