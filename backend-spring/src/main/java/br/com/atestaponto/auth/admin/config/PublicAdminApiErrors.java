package br.com.atestaponto.auth.admin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;

final class PublicAdminApiErrors {
    private PublicAdminApiErrors() {}

    static void write(HttpServletResponse response, ObjectMapper json, int status, String code, String message)
            throws IOException {
        write(response, json, status, code, message, Map.of());
    }

    static void write(HttpServletResponse response, ObjectMapper json, int status, String code, String message, Object details)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        json.writeValue(response.getOutputStream(), Map.of("success", false,
                "error", Map.of("code", code, "message", message, "details", details)));
    }
}
