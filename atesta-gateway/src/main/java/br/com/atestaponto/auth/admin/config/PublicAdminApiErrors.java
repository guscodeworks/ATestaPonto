package br.com.atestaponto.auth.admin.config;

import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
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

    // Cota na janela padrao dos filtros administrativos; excedida, responde 429 sem seguir a cadeia.
    static boolean reserve(PublicAdminRateLimit limits, ObjectMapper json, String name, Object subject, int max,
            HttpServletResponse response) throws IOException {
        if (limits.reserve(name, subject, max, response).hits() <= max) return true;
        limit(response, json, 429, "RATE_LIMITED", "Muitas requisicoes. Tente novamente em instantes");
        return false;
    }

    // Corpo historico das respostas de limite: sem details, ao contrario de write.
    static void limit(HttpServletResponse response, ObjectMapper json, int status, String code, String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        json.writeValue(response.getOutputStream(), Map.of("success", false, "error", Map.of("code", code, "message", message)));
    }
}
