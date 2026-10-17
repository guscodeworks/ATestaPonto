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
import java.net.InetAddress;
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
            if (!reserve("ip-abuse", ipSubject(request.getRemoteAddr()), limits.ipLimit(), response)) return;
            var auth = SecurityContextHolder.getContext().getAuthentication();
            String path = request.getServletPath().replaceAll("/+$", ""), method = request.getMethod();
            boolean grant = method.equals("POST") && path.equals("/api/admin/acessos");
            boolean qr = method.equals("POST") && path.equals("/api/admin/qr-tokens");
            var change = java.util.regex.Pattern.compile("/api/admin/acessos/([^/]+)/(suspender|reativar|revogar)").matcher(path);
            boolean status = method.equals("PATCH") && change.matches();
            if ((grant || qr || status) && auth != null && auth.getPrincipal() instanceof AdminPrincipal admin) {
                String subject = "admin:" + admin.id();
                if (!reserve("sensitive", subject, 40, response)) return;
                if (!reserve("sensitive-resource", List.of(subject, qr ? "/api/admin/qr-tokens" : "/api/admin/acessos",
                        status ? "/:id/" + change.group(2) : "/", status ? change.group(1) : ""), 40, response)) return;
            }
        } catch (RuntimeException unavailable) {
            limitError(response, 503, "RATE_LIMIT_UNAVAILABLE", "Protecao temporariamente indisponivel. Tente novamente em instantes.");
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

    private boolean reserve(String name, Object subject, int max, HttpServletResponse response) throws IOException {
        var value = limits.increment(name, subject);
        long seconds = Math.max(1, (value.ttl() + 999) / 1000);
        response.addHeader("RateLimit", "\"" + name + "\"; r=" + Math.max(0, max - value.hits()) + "; t=" + seconds);
        response.addHeader("RateLimit-Policy", "\"" + name + "\"; q=" + max + "; w=900");
        if (value.hits() <= max) return true;
        response.setHeader("Retry-After", Long.toString(seconds));
        limitError(response, 429, "RATE_LIMITED", "Muitas requisicoes. Tente novamente em instantes");
        return false;
    }

    private void limitError(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        json.writeValue(response.getOutputStream(), java.util.Map.of("success", false,
                "error", java.util.Map.of("code", code, "message", message)));
    }

    private static String ipSubject(String ip) {
        if (ip == null || !ip.matches("[0-9a-fA-F:.%]+")) return "unknown-ip";
        if (!ip.contains(":")) return ip;
        try {
            byte[] bytes = InetAddress.getByName(ip).getAddress();
            if (bytes.length == 4) return InetAddress.getByAddress(bytes).getHostAddress();
            java.util.Arrays.fill(bytes, 7, 16, (byte) 0);
            int[] groups = new int[8];
            for (int i = 0; i < 8; i++) groups[i] = (bytes[i * 2] & 255) * 256 + (bytes[i * 2 + 1] & 255);
            int best = -1, length = 1;
            for (int i = 0; i < 8;) {
                if (groups[i] != 0) { i++; continue; }
                int start = i;
                while (i < 8 && groups[i] == 0) i++;
                if (i - start > length) { best = start; length = i - start; }
            }
            var result = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                if (i == best) { result.append("::"); i += length - 1; continue; }
                if (!result.isEmpty() && result.charAt(result.length() - 1) != ':') result.append(':');
                result.append(Integer.toHexString(groups[i]));
            }
            return result + "/56";
        } catch (java.net.UnknownHostException invalid) { return "unknown-ip"; }
    }

}
