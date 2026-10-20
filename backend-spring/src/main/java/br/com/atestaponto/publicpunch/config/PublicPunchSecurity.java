package br.com.atestaponto.publicpunch.config;

import br.com.atestaponto.publicpunch.service.PublicPunchException;
import br.com.atestaponto.publicpunch.service.PublicPunchRateLimit;
import br.com.atestaponto.publicpunch.controller.PublicPunchErrors;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class PublicPunchSecurity {
    @Bean
    @Order(-1)
    public SecurityFilterChain employeePagesSecurity(HttpSecurity http) throws Exception {
        return http.securityMatcher("/", "/login", "/login/", "/home", "/home/", "/ponto", "/ponto/",
                        "/bater-ponto", "/bater-ponto/", "/ponto/acessar", "/ponto/acessar/",
                        "/index.html", "/index.html/", "/home.html", "/home.html/", "/login.html", "/login.html/",
                        "/funcionario/login", "/funcionario/login/", "/funcionario/login.html", "/funcionario/login.html/")
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(c -> c.requireExplicitSave(true))
                .requestCache(c -> c.disable()).csrf(c -> c.disable()).logout(c -> c.disable())
                .headers(h -> h.referrerPolicy(r -> r.policy(
                        org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .authorizeHttpRequests(a -> a.anyRequest().permitAll()).build();
    }

    private static final Map<String, String> METHODS = Map.of(
            "/login", "POST", "/registrar", "POST", "/bater", "POST", "/hoje", "GET", "/historico", "GET",
            "/primeiro-acesso/trocar-senha", "POST", "/recuperar-senha/solicitar", "POST",
            "/recuperar-senha/validar", "POST", "/recuperar-senha/redefinir", "POST");
    @Bean
    @Order(0)
    public SecurityFilterChain publicPunchSecurityChain(HttpSecurity http, PublicPunchRateLimit limits, ObjectMapper json,
            org.springframework.core.env.Environment env) throws Exception {
        boolean production = env.getProperty("NODE_ENV", "development").strip().equalsIgnoreCase("production");
        var origins = new java.util.ArrayList<String>();
        for (String origin : env.getProperty("CORS_ORIGIN", "").split(",")) {
            origin = origin.strip();
            if (origin.isEmpty()) continue;
            if (origin.equals("*") && !production) { origins.add(origin); continue; }
            java.net.URI uri = java.net.URI.create(origin);
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))
                    || !(uri.getScheme().equals("https") || !production && uri.getScheme().equals("http")))
                throw new IllegalArgumentException("CORS_ORIGIN invalida");
            int port = uri.getPort();
            String scheme = uri.getScheme().toLowerCase(java.util.Locale.ROOT);
            boolean defaultPort = port == -1 || scheme.equals("https") && port == 443 || scheme.equals("http") && port == 80;
            origins.add(scheme + "://" + uri.getHost().toLowerCase(java.util.Locale.ROOT) + (defaultPort ? "" : ":" + port));
        }
        return http.securityMatcher("/api/pontos", "/api/pontos/**")
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(c -> c.requireExplicitSave(true))
                .requestCache(c -> c.disable()).csrf(c -> c.disable()).logout(c -> c.disable())
                .authorizeHttpRequests(a -> a.anyRequest().permitAll())
                .addFilterAfter(new OncePerRequestFilter() {
                    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                            throws IOException, ServletException {
                        res.setHeader("Cache-Control", "no-store"); res.setHeader("Pragma", "no-cache");
                        String origin = req.getHeader("Origin");
                        if (origin != null) {
                            if (!origins.contains(origin) && !(origins.contains("*") && !production)) {
                                PublicPunchErrors.write(res, json, new PublicPunchException(403, "CORS_ORIGIN_BLOCKED", "Origem nao permitida por CORS")); return;
                            }
                            res.setHeader("Access-Control-Allow-Origin", origin);
                            res.setHeader("Access-Control-Allow-Credentials", "true");
                            res.addHeader("Vary", "Origin");
                        }
                        if (req.getMethod().equals("OPTIONS")) {
                            res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
                            res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
                            res.setStatus(204); return;
                        }
                        String suffix = req.getServletPath().substring("/api/pontos".length()).replaceAll("/$", "");
                        String method = METHODS.get(suffix);
                        if (method == null) {
                            PublicPunchErrors.write(res, json, new PublicPunchException(404, "NOT_FOUND", "Route not found")); return;
                        }
                        if (!req.getMethod().equals(method) && !(method.equals("GET") && req.getMethod().equals("HEAD"))) {
                            res.setHeader("Allow", method);
                            String message = switch (suffix) {
                                case "/login" -> "Metodo nao permitido para login de funcionario. Use POST.";
                                case "/registrar" -> "Metodo nao permitido para registrar ponto. Use POST.";
                                case "/bater" -> "Metodo nao permitido para bater ponto. Use POST.";
                                default -> "Method not allowed";
                            };
                            PublicPunchErrors.write(res, json, new PublicPunchException(405, "METHOD_NOT_ALLOWED", message,
                                    Map.of("allowedMethods", java.util.List.of(method)))); return;
                        }
                        try {
                            if (method.equals("POST")) {
                                limits.ip(req, res);
                                req.setAttribute("publicPunchBody", body(req, json));
                            }
                        } catch (PublicPunchException e) { PublicPunchErrors.write(res, json, e); return; }
                        chain.doFilter(req, res);
                    }
                }, SecurityContextHolderFilter.class).build();
    }
    private static com.fasterxml.jackson.databind.JsonNode body(HttpServletRequest request, ObjectMapper json) throws IOException {
        String type = request.getContentType();
        type = type == null ? "" : type.split(";", 2)[0].strip().toLowerCase(java.util.Locale.ROOT);
        if (!type.equals("application/json") && !type.equals("application/x-www-form-urlencoded")) return json.createObjectNode();
        byte[] bytes = request.getInputStream().readNBytes(100 * 1024 + 1);
        if (bytes.length > 100 * 1024) throw new PublicPunchException(413, "REQUEST_ERROR", "request entity too large");
        if (bytes.length == 0) return json.createObjectNode();
        if (type.equals("application/x-www-form-urlencoded")) {
            var result = json.createObjectNode();
            for (String pair : new String(bytes, java.nio.charset.StandardCharsets.UTF_8).split("&")) {
                String[] parts = pair.split("=", 2);
                try {
                    String key = java.net.URLDecoder.decode(parts[0], java.nio.charset.StandardCharsets.UTF_8);
                    String value = java.net.URLDecoder.decode(parts.length > 1 ? parts[1] : "", java.nio.charset.StandardCharsets.UTF_8);
                    if (result.has(key)) {
                        if (result.get(key).isArray()) ((com.fasterxml.jackson.databind.node.ArrayNode) result.get(key)).add(value);
                        else result.set(key, json.createArrayNode().add(result.get(key)).add(value));
                    } else result.put(key, value);
                } catch (IllegalArgumentException invalid) { throw new PublicPunchException(400, "BAD_REQUEST", "Invalid form payload"); }
            }
            return result;
        }
        try (var parser = json.getFactory().createParser(bytes)) {
            com.fasterxml.jackson.databind.JsonNode payload = json.readTree(parser);
            if (payload == null || !payload.isContainerNode() || parser.nextToken() != null) throw new IOException();
            return payload;
        } catch (IOException invalid) { throw new PublicPunchException(400, "BAD_REQUEST", "Invalid JSON payload"); }
    }

}
