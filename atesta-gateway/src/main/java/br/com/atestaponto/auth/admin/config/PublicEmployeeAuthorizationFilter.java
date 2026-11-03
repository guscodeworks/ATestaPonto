package br.com.atestaponto.auth.admin.config;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.employee.dto.PublicEmployeeInput;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.springframework.web.filter.OncePerRequestFilter;

final class PublicEmployeeAuthorizationFilter extends OncePerRequestFilter {
    private static final String ROOT = "/api/admin/funcionarios";
    private static final Pattern ITEM = Pattern.compile(ROOT + "/([^/]+)(?:/(desativar|reativar))?/?");
    private final PublicEmployeeAuthorization authorization;
    private final ObjectMapper json;

    PublicEmployeeAuthorizationFilter(PublicEmployeeAuthorization authorization, ObjectMapper json) {
        this.authorization = authorization;
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !path.equals(ROOT) && !path.startsWith(ROOT + "/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!(request.getAttribute("adminContext") instanceof AdminContextResponse admin)) {
            PublicAdminApiErrors.write(response, json, 401, "UNAUTHORIZED", "Unauthorized");
            return;
        }
        try {
            String path = request.getServletPath(), method = request.getMethod(), capability;
            Long employeeId = null, schoolId = null;
            var item = ITEM.matcher(path);
            if (path.equals(ROOT) || path.equals(ROOT + "/")) {
                capability = switch (method) {
                    case "GET" -> "funcionario.listar";
                    case "POST" -> "funcionario.criar";
                    default -> throw new IllegalArgumentException();
                };
                if (method.equals("POST")) {
                    if (request.getContentType() == null || !org.springframework.http.MediaType.APPLICATION_JSON
                            .isCompatibleWith(org.springframework.http.MediaType.parseMediaType(request.getContentType()))) {
                        throw new IllegalArgumentException();
                    }
                    byte[] body = request.getInputStream().readNBytes(100 * 1024 + 1);
                    if (body.length > 100 * 1024) {
                        PublicAdminApiErrors.write(response, json, 413, "REQUEST_ERROR", "request entity too large");
                        return;
                    }
                    try (var parser = json.getFactory().createParser(body)) {
                        parser.enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION.mappedFeature());
                        com.fasterxml.jackson.databind.JsonNode payload = json.readTree(parser);
                        if (payload == null || !payload.isObject() || parser.nextToken() != null) {
                            throw PublicEmployeeInput.invalid("Corpo da requisicao invalido");
                        }
                        schoolId = PublicEmployeeInput.schoolId(payload.get("unidade_escolar_id"));
                    }
                    request = new BodyRequest(request, body);
                }
            } else if ((path.equals(ROOT + "/unidades") || path.equals(ROOT + "/unidades/")) && method.equals("GET")) {
                capability = "funcionario.criar";
            } else if (item.matches()) {
                try {
                    if (!item.group(1).matches("\\+?[0-9]+")) throw new NumberFormatException();
                    employeeId = Long.valueOf(item.group(1));
                    if (employeeId < 1 || employeeId > 9007199254740991L) throw new NumberFormatException();
                } catch (NumberFormatException invalid) {
                    throw PublicEmployeeInput.invalid("id", "params", "ID de funcionario invalido");
                }
                if (method.equals("GET") && item.group(2) == null) capability = "funcionario.visualizar";
                else if (method.equals("PATCH")) capability = "funcionario." + (item.group(2) == null ? "editar" : item.group(2));
                else throw new IllegalArgumentException();
            } else throw new IllegalArgumentException();

            request.setAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE,
                    authorization.authorize(admin, capability, employeeId, schoolId));
        } catch (PublicEmployeeInput.Invalid invalid) {
            PublicAdminApiErrors.write(response, json, 422, "VALIDATION_ERROR", invalid.getReason(), invalid.details());
            return;
        } catch (org.springframework.web.server.ResponseStatusException denied) {
            int status = denied.getStatusCode().value() == 422 ? 422 : 403;
            PublicAdminApiErrors.write(response, json, status, status == 422 ? "VALIDATION_ERROR" : "FORBIDDEN",
                    status == 422 ? denied.getReason() : "Operacao fora do escopo administrativo");
            return;
        } catch (com.fasterxml.jackson.core.JsonProcessingException malformed) {
            PublicAdminApiErrors.write(response, json, 400, "BAD_REQUEST", "Invalid JSON payload");
            return;
        } catch (RuntimeException | IOException denied) {
            PublicAdminApiErrors.write(response, json, 403, "FORBIDDEN", "Operacao fora do escopo administrativo");
            return;
        }
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        chain.doFilter(request, response);
    }

    private static final class BodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        BodyRequest(HttpServletRequest request, byte[] body) { super(request); this.body = body; }

        @Override
        public ServletInputStream getInputStream() {
            var input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException("Somente leitura sincrona e suportada");
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }
}
