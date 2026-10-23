package br.com.atestaponto.auth.admin.config;

import br.com.atestaponto.auth.admin.controller.PublicAdminAuthController.AdminPrincipal;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicReportAuthorization;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.web.util.ServletRequestPathUtils;

@Configuration
public class AdminSecurityConfiguration {
    @Bean
    public HttpSessionSecurityContextRepository adminSecurityContexts() {
        var repository = new HttpSessionSecurityContextRepository();
        repository.setDisableUrlRewriting(true);
        return repository;
    }

    @Bean
    @Order(1)
    public SecurityFilterChain internalSecurity(HttpSecurity http) throws Exception {
        // O filtro HMAC existente autentica estas rotas; cookies nunca substituem a assinatura.
        return http.securityMatcher("/internal/**")
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(c -> c.disable()).requestCache(c -> c.disable())
                .authorizeHttpRequests(a -> a.anyRequest().permitAll()).build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain publicAdminSecurity(HttpSecurity http,
            HttpSessionSecurityContextRepository contexts, PublicAdminAuthorization authorization,
            PublicEmployeeAuthorization employees, PublicReportAuthorization reports,
            PublicAdminRateLimit limits, ObjectMapper json,
            @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings,
            @org.springframework.beans.factory.annotation.Value("${admin.govbr.redirect-uri}") String redirectUri) throws Exception {
        var callback = java.net.URI.create(redirectUri);
        String origin = callback.getScheme() + "://" + callback.getRawAuthority();
        return http.securityContext(c -> c.securityContextRepository(contexts))
                .requestCache(c -> c.disable())
                .csrf(c -> c.ignoringRequestMatchers("/auth/govbr/logout")
                        // O frontend existente nao envia token CSRF; exige origem configurada para estas APIs.
                        .ignoringRequestMatchers(request -> publicApi(request) && sameOrigin(request, origin)))
                .logout(c -> c.disable())
                .authorizeHttpRequests(a -> a
                        .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll()
                        // Assets publicos sao somente leitura; APIs e demais rotas continuam protegidas.
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/assets/**", "/icons/**", "/img/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.HEAD, "/assets/**", "/icons/**", "/img/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/health", "/ready").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                "/auth/govbr/login", "/auth/govbr/start", "/auth/govbr/callback", "/admin/login",
                                "/admin/login.html", "/admin/login.html/").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/auth/govbr/logout").permitAll()
                        .requestMatchers("/admin/**", "/api/admin/**").hasRole("ADMIN")
                        .anyRequest().denyAll())
                .exceptionHandling(e -> e.authenticationEntryPoint((request, response, failure) -> {
                    if (publicApi(request)) PublicAdminApiErrors.write(response, json, 401, "UNAUTHORIZED",
                            reportApi(request) ? "Sessao administrativa Gov.br obrigatoria" : "Unauthorized");
                    else if (request.getServletPath().startsWith("/api/")) response.sendError(401);
                    else response.sendRedirect("/auth/govbr/login");
                }).accessDeniedHandler((request, response, failure) -> {
                    if (publicApi(request)) PublicAdminApiErrors.write(response, json, 403, "FORBIDDEN", "Forbidden");
                    else response.sendError(403);
                }))
                .addFilterBefore(new OncePerRequestFilter() {
                    @Override
                    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                            FilterChain chain) throws ServletException, IOException {
                        // APIs mantem seus contratos; caminhos MVC conhecidos continuam sujeitos a autenticacao e RBAC.
                        if (!request.getServletPath().startsWith("/api/") && !isPublicStaticAssetRequest(request)) {
                            var path = ServletRequestPathUtils.parseAndCache(request).pathWithinApplication();
                            boolean knownPath = mappings.getHandlerMethods().keySet().stream()
                                    .flatMap(mapping -> mapping.getPathPatternsCondition().getPatterns().stream())
                                    .anyMatch(pattern -> pattern.matches(path));
                            if (!knownPath) {
                                response.sendError(HttpServletResponse.SC_NOT_FOUND);
                                return;
                            }
                        }
                        chain.doFilter(request, response);
                    }
                }, SecurityContextHolderFilter.class)
                .addFilterAfter(new PublicAccessApiFilter(limits, json), SecurityContextHolderFilter.class)
                .addFilterAfter(new OncePerRequestFilter() {
                    @Override
                    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                            FilterChain chain) throws ServletException, IOException {
                        var authentication = SecurityContextHolder.getContext().getAuthentication();
                        if (authentication != null && authentication.getPrincipal() instanceof AdminPrincipal admin
                                && !request.getServletPath().equals("/auth/govbr/logout")) {
                            var session = request.getSession(false);
                            try {
                                if (session == null || !(session.getAttribute("ADMIN_EXPIRES_AT") instanceof Instant expiry)
                                        || !Instant.now().isBefore(expiry)) throw new IllegalStateException();
                                request.setAttribute("adminContext", reportApi(request)
                                        ? authorization.requireApiSession(admin.id()) : authorization.requireActive(admin.id()));
                            } catch (RuntimeException denied) {
                                boolean expired = session == null
                                        || !(session.getAttribute("ADMIN_EXPIRES_AT") instanceof Instant expiry)
                                        || !Instant.now().isBefore(expiry);
                                if (session != null) session.invalidate();
                                SecurityContextHolder.clearContext();
                                if (reportApi(request)) {
                                    int status = denied instanceof org.springframework.web.server.ResponseStatusException error
                                            ? error.getStatusCode().value() : 401;
                                    String message = denied instanceof org.springframework.web.server.ResponseStatusException error
                                            ? error.getReason() : "Falha ao validar sessao administrativa";
                                    if (expired) {
                                        status = 401;
                                        message = "Sessao administrativa Gov.br obrigatoria";
                                    }
                                    PublicAdminApiErrors.write(response, json, status, status == 403 ? "FORBIDDEN" : "UNAUTHORIZED", message);
                                    return;
                                }
                                if (publicApi(request)) PublicAdminApiErrors.write(response, json, 401, "UNAUTHORIZED", "Unauthorized");
                                else if (request.getServletPath().startsWith("/api/")) response.sendError(401);
                                else response.sendRedirect("/auth/govbr/login");
                                return;
                            }
                        }
                        chain.doFilter(request, response);
                    }
                }, PublicAccessApiFilter.class)
                .addFilterAfter(new PublicEmployeeAuthorizationFilter(employees, json), AuthorizationFilter.class)
                .addFilterAfter(new PublicReportApiFilter(reports, limits, json), PublicEmployeeAuthorizationFilter.class)
                .build();
    }

    private static boolean isPublicStaticAssetRequest(HttpServletRequest request) {
        String method = request.getMethod();
        if (!"GET".equals(method) && !"HEAD".equals(method)) return false;
        String path = request.getServletPath();
        return path.startsWith("/assets/") || path.startsWith("/icons/") || path.startsWith("/img/");
    }

    private static boolean reportApi(HttpServletRequest request) {
        return request.getServletPath().startsWith("/api/admin/pontos/")
                || request.getServletPath().matches("/api/admin/auth/me/?");
    }

    private static boolean publicApi(HttpServletRequest request) {
        String path = request.getServletPath();
        return java.util.List.of("/api/admin/funcionarios", "/api/admin/escolas", "/api/admin/diretorias",
                        "/api/admin/acessos", "/api/admin/cargos", "/api/admin/qr-tokens",
                        "/api/admin/pontos", "/api/admin/auth/me")
                .stream().anyMatch(prefix -> path.equals(prefix) || path.startsWith(prefix + "/"));
    }

    private static boolean sameOrigin(HttpServletRequest request, String origin) {
        String source = request.getHeader("Origin");
        if (source == null) source = request.getHeader("Referer");
        try {
            var uri = java.net.URI.create(source == null ? "" : source);
            return uri.getUserInfo() == null && origin.equals(uri.getScheme() + "://" + uri.getRawAuthority());
        } catch (IllegalArgumentException invalid) { return false; }
    }
}
