package br.com.atestaponto.publicpunch.controller;

import br.com.atestaponto.publicpunch.service.PublicPunchException;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsException;
import br.com.atestaponto.punch.service.PunchException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.core.MethodParameter;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

@RestControllerAdvice(assignableTypes = {PublicPunchController.class, EmployeePagesController.class})
public class PublicPunchErrors implements ResponseBodyAdvice<Object> {
    private final boolean production;
    public PublicPunchErrors(Environment env) {
        production = env.getProperty("NODE_ENV", "development").strip().equalsIgnoreCase("production");
    }
    @Override
    public boolean supports(MethodParameter method, Class<? extends HttpMessageConverter<?>> converter) {
        return true;
    }
    @Override
    public Object beforeBodyWrite(Object body, MethodParameter method, MediaType type,
            Class<? extends HttpMessageConverter<?>> converter, ServerHttpRequest request, ServerHttpResponse response) {
        String path = request.getURI().getPath();
        if ((path.equals("/ponto/bater") || path.equals("/ponto/bater/"))
                && body instanceof Map<?, ?> payload && payload.get("error") instanceof Map<?, ?> error) {
            if (rateLimit(error.get("code")))
                return Map.of("success", false, "error", Map.of("code", error.get("code"), "message", error.get("message")));
            if (production && response instanceof ServletServerHttpResponse servlet && servlet.getServletResponse().getStatus() >= 500)
                return Map.of("success", false, "error", Map.of("code", error.get("code"),
                        "message", "Internal server error", "details", Map.of()));
        }
        return body;
    }
    @ExceptionHandler(PublicPunchException.class)
    public ResponseEntity<?> business(PublicPunchException e) { return ResponseEntity.status(e.status()).body(body(e)); }
    @ExceptionHandler(PunchException.class)
    public ResponseEntity<?> punch(PunchException e) { return business(new PublicPunchException(e.status(), e.code(), e.getMessage())); }
    @ExceptionHandler(EmployeeCredentialsException.class)
    public ResponseEntity<?> credentials(EmployeeCredentialsException e) { return business(new PublicPunchException(e.status(), e.code(), e.getMessage())); }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> invalid(HttpMessageNotReadableException e) { return business(new PublicPunchException(400, "BAD_REQUEST", "Invalid JSON payload")); }
    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<?> duplicate(DuplicateKeyException e) { return business(new PublicPunchException(409, "CONFLICT", "Registro duplicado de ponto detectado")); }
    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    public ResponseEntity<?> database(Exception e) {
        Throwable cause = e;
        while (cause.getCause() != null) cause = cause.getCause();
        if (cause instanceof SQLException sql) {
            switch (sql.getErrorCode()) {
                case 1452, 1364: return business(new PublicPunchException(422, "VALIDATION_ERROR", "Invalid reference or missing required field"));
                case 1451: return business(new PublicPunchException(409, "CONFLICT", "Record is referenced by other resources"));
                case 1406, 1292: return business(new PublicPunchException(422, "VALIDATION_ERROR", "Provided data is invalid or too long"));
                default: break;
            }
        }
        return unexpected(e);
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unexpected(Exception e) { return business(new PublicPunchException(500, "INTERNAL_ERROR", "Internal server error")); }
    static Map<String, Object> body(PublicPunchException e) {
        return Map.of("success", false, "error", Map.of("code", e.code(), "message", e.getMessage(), "details", e.details()));
    }
    public static void write(HttpServletResponse response, ObjectMapper json, PublicPunchException e) throws IOException {
        write(response, json, e, false);
    }
    public static void write(HttpServletResponse response, ObjectMapper json, PublicPunchException e, boolean legacyPunch) throws IOException {
        response.setStatus(e.status()); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        json.writeValue(response.getOutputStream(), legacyPunch && rateLimit(e.code())
                ? Map.of("success", false, "error", Map.of("code", e.code(), "message", e.getMessage())) : body(e));
    }
    private static boolean rateLimit(Object code) { return "RATE_LIMITED".equals(code) || "RATE_LIMIT_UNAVAILABLE".equals(code); }
}
