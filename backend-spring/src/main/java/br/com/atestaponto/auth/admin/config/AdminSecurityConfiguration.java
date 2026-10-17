package br.com.atestaponto.auth.admin.config;

import br.com.atestaponto.auth.admin.controller.PublicAdminAuthController.AdminPrincipal;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
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
            HttpSessionSecurityContextRepository contexts, PublicAdminAuthorization authorization) throws Exception {
        return http.securityContext(c -> c.securityContextRepository(contexts))
                .requestCache(c -> c.disable())
                .csrf(c -> c.ignoringRequestMatchers("/auth/govbr/logout"))
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
                    if (request.getServletPath().startsWith("/api/")) response.sendError(401);
                    else response.sendRedirect("/auth/govbr/login");
                }))
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
                                if (request.getServletPath().startsWith("/api/")) response.sendError(401);
                                else response.sendRedirect("/auth/govbr/login");
                                return;
                            }
                        }
                        chain.doFilter(request, response);
                    }
                }, SecurityContextHolderFilter.class).build();
    }
}
