package br.com.atestaponto.auth.admin.config;

import br.com.atestaponto.auth.admin.controller.PublicAdminAuthController.AdminPrincipal;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
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
            PublicEmployeeAuthorization employees, PublicAdminRateLimit limits, ObjectMapper json,
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
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/health").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                "/auth/govbr/login", "/auth/govbr/start", "/auth/govbr/callback", "/admin/login").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/auth/govbr/logout").permitAll()
                        .requestMatchers("/admin/**", "/api/admin/**").hasRole("ADMIN")
                        .anyRequest().denyAll())
                .exceptionHandling(e -> e.authenticationEntryPoint((request, response, failure) -> {
                    if (publicApi(request)) PublicAdminApiErrors.write(response, json, 401, "UNAUTHORIZED", "Unauthorized");
                    else if (request.getServletPath().startsWith("/api/")) response.sendError(401);
                    else response.sendRedirect("/auth/govbr/login");
                }).accessDeniedHandler((request, response, failure) -> {
                    if (publicApi(request)) PublicAdminApiErrors.write(response, json, 403, "FORBIDDEN", "Forbidden");
                    else response.sendError(403);
                }))
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
                                request.setAttribute("adminContext", authorization.requireActive(admin.id()));
                            } catch (RuntimeException denied) {
                                if (session != null) session.invalidate();
                                SecurityContextHolder.clearContext();
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
                .build();
    }

    private static boolean publicApi(HttpServletRequest request) {
        String path = request.getServletPath();
        return java.util.List.of("/api/admin/funcionarios", "/api/admin/escolas", "/api/admin/diretorias",
                        "/api/admin/acessos", "/api/admin/cargos", "/api/admin/qr-tokens")
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
