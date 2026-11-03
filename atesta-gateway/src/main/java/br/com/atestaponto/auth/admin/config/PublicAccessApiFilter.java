package br.com.atestaponto.auth.admin.config;

import br.com.atestaponto.auth.admin.controller.PublicAdminAuthController.AdminPrincipal;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

final class PublicAccessApiFilter extends OncePerRequestFilter {
    private final PublicAdminRateLimit limits;
    private final ObjectMapper json;
    PublicAccessApiFilter(PublicAdminRateLimit limits, ObjectMapper json) { this.limits = limits; this.json = json; }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return List.of("/api/admin/acessos", "/api/admin/cargos", "/api/admin/qr-tokens").stream()
                .noneMatch(p -> request.getServletPath().equals(p) || request.getServletPath().startsWith(p + "/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        try {
            if (!PublicAdminApiErrors.reserve(limits, json, "ip-abuse", PublicAdminRateLimit.ipSubject(request.getRemoteAddr()), limits.ipLimit(), response)) return;
            var auth = SecurityContextHolder.getContext().getAuthentication();
            String path = request.getServletPath().replaceAll("/+$", ""), method = request.getMethod();
            boolean grant = method.equals("POST") && path.equals("/api/admin/acessos");
            boolean qr = method.equals("POST") && path.equals("/api/admin/qr-tokens");
            var change = java.util.regex.Pattern.compile("/api/admin/acessos/([^/]+)/(suspender|reativar|revogar)").matcher(path);
            boolean status = method.equals("PATCH") && change.matches();
            if ((grant || qr || status) && auth != null && auth.getPrincipal() instanceof AdminPrincipal admin) {
                String subject = "admin:" + admin.id();
                if (!PublicAdminApiErrors.reserve(limits, json, "sensitive", subject, 40, response)) return;
                if (!PublicAdminApiErrors.reserve(limits, json, "sensitive-resource", List.of(subject, qr ? "/api/admin/qr-tokens" : "/api/admin/acessos",
                        status ? "/:id/" + change.group(2) : "/", status ? change.group(1) : ""), 40, response)) return;
            }
        } catch (RuntimeException unavailable) {
            PublicAdminApiErrors.limit(response, json, 503, "RATE_LIMIT_UNAVAILABLE", "Protecao temporariamente indisponivel. Tente novamente em instantes.");
            return;
        }
        String type = request.getContentType();
        if (List.of("POST", "PATCH").contains(request.getMethod()) && type != null
                && type.split(";", 2)[0].strip().equalsIgnoreCase("application/json")) {
            byte[] body = request.getInputStream().readNBytes(100 * 1024 + 1);
            if (body.length > 100 * 1024) {
                PublicAdminApiErrors.write(response, json, 413, "REQUEST_ERROR", "request entity too large");
                return;
            }
            if (body.length > 0) {
                try (var parser = json.getFactory().createParser(body)) {
                    parser.enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION.mappedFeature());
                    var payload = json.readTree(parser);
                    if (payload == null || !payload.isContainerNode() || parser.nextToken() != null) throw new IOException();
                    request.setAttribute("publicAccessBody", payload);
                } catch (IOException invalid) {
                    PublicAdminApiErrors.write(response, json, 400, "BAD_REQUEST", "Invalid JSON payload");
                    return;
                }
            }
        }
        chain.doFilter(request, response);
    }
}
