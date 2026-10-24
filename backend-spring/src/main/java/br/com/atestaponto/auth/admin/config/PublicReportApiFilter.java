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
                // RemoteIpValve (forward-headers-strategy=native) ja resolve X-Forwarded-For apenas de proxies internos.
                if (!PublicAdminApiErrors.reserve(limits, json, "ip-abuse", PublicAdminRateLimit.ipSubject(request.getRemoteAddr()), limits.ipLimit(), response)) return;
                String subject = "admin:" + admin.admin().id();
                if (!PublicAdminApiErrors.reserve(limits, json, "sensitive", subject, 40, response)) return;
                if (!PublicAdminApiErrors.reserve(limits, json, "sensitive-resource", List.of(subject, ROOT, suffix, ""), 40, response)) return;
            } catch (RuntimeException unavailable) {
                PublicAdminApiErrors.limit(response, json, 503, "RATE_LIMIT_UNAVAILABLE", "Protecao temporariamente indisponivel. Tente novamente em instantes.");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
