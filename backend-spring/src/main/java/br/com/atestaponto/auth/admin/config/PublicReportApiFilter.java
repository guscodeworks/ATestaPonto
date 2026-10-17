package br.com.atestaponto.auth.admin.config;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import br.com.atestaponto.auth.admin.service.PublicReportAuthorization;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.util.List;
import java.util.Map;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

final class PublicReportApiFilter extends OncePerRequestFilter {
    private static final String ROOT = "/api/admin/pontos";
    private static final Map<String, String> CAPABILITIES = Map.of(
            "/hoje", "ponto.hoje.visualizar", "/relatorio", "relatorio.visualizar",
            "/relatorio/semanal", "relatorio.hierarquico.visualizar",
            "/relatorio/hierarquia", "relatorio.hierarquico.visualizar", "/resumo", "ponto.resumo.visualizar");
    private final PublicReportAuthorization authorization;
    private final PublicAdminRateLimit limits;
    private final ObjectMapper json;

    PublicReportApiFilter(PublicReportAuthorization authorization, PublicAdminRateLimit limits, ObjectMapper json) {
        this.authorization = authorization; this.limits = limits; this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getServletPath().startsWith(ROOT + "/")
                && !request.getServletPath().matches("/api/admin/auth/me/?");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        String path = request.getServletPath().replaceAll("/$", "");
        String suffix = path.startsWith(ROOT) ? path.substring(ROOT.length()) : "";
        if (request.getMethod().equals("GET") && CAPABILITIES.containsKey(suffix)) {
            if (!(request.getAttribute("adminContext") instanceof AdminContextResponse admin)) {
                PublicAdminApiErrors.write(response, json, 401, "UNAUTHORIZED", "Sessao administrativa Gov.br obrigatoria");
                return;
            }
            try {
                request.setAttribute("reportScope", authorization.authorize(admin, CAPABILITIES.get(suffix)));
            } catch (ResponseStatusException denied) {
                PublicAdminApiErrors.write(response, json, 403, "FORBIDDEN", denied.getReason());
                return;
            } catch (RuntimeException unavailable) {
                PublicAdminApiErrors.write(response, json, 403, "FORBIDDEN", "Falha ao resolver escopo administrativo");
                return;
            }
            try {
                // Express usa trust proxy=1: o ultimo salto de X-Forwarded-For e o IP da cota.
                String forwarded = request.getHeader("X-Forwarded-For");
                String[] hops = forwarded == null ? new String[0] : forwarded.split(",", -1);
                String ip = hops.length == 0 ? request.getRemoteAddr() : hops[hops.length - 1].strip();
                if (!reserve("ip-abuse", ipSubject(ip), limits.ipLimit(), response)) return;
                String subject = "admin:" + admin.admin().id();
                if (!reserve("sensitive", subject, 40, response)) return;
                if (!reserve("sensitive-resource", List.of(subject, ROOT, suffix, ""), 40, response)) return;
            } catch (RuntimeException unavailable) {
                limitError(response, 503, "RATE_LIMIT_UNAVAILABLE", "Protecao temporariamente indisponivel. Tente novamente em instantes.");
                return;
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
