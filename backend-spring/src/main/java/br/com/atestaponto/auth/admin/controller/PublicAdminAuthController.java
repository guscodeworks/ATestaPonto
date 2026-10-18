package br.com.atestaponto.auth.admin.controller;

import br.com.atestaponto.auth.admin.service.AdminContextService;
import br.com.atestaponto.auth.admin.service.GovbrClient;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.Serializable;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class PublicAdminAuthController {
    public record AdminPrincipal(long id, String sub, Instant loginAt, String name, String email) implements Serializable {}
    private record PendingLogin(String state, String verifier, Instant expiresAt) implements Serializable {}
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String PENDING = "ADMIN_OAUTH_PENDING";
    private final GovbrClient govbr;
    private final AdminContextService admins;
    private final PublicAdminAuthorization authorization;
    private final HttpSessionSecurityContextRepository contexts;
    private final String origin, logoutUrl;
    private final long ttlSeconds;
    private final boolean secureCookie;

    public PublicAdminAuthController(GovbrClient govbr, AdminContextService admins,
            PublicAdminAuthorization authorization, HttpSessionSecurityContextRepository contexts,
            @Value("${admin.govbr.redirect-uri}") String redirectUri,
            @Value("${admin.govbr.logout-url}") String logoutUrl,
            @Value("${admin.session.ttl-seconds}") long ttlSeconds,
            @Value("${admin.session.secure}") boolean secureCookie) {
        this.govbr = govbr;
        this.admins = admins;
        this.authorization = authorization;
        this.contexts = contexts;
        URI callback = URI.create(redirectUri);
        this.origin = callback.getScheme() + "://" + callback.getRawAuthority();
        if (!logoutUrl.equals("/")) {
            URI logout = URI.create(logoutUrl);
            if (logout.getHost() == null || logout.getUserInfo() != null || logout.getFragment() != null
                    || !("https".equals(logout.getScheme())
                    || ("http".equals(callback.getScheme()) && "http".equals(logout.getScheme())))) {
                throw new IllegalArgumentException("URL de logout invalida");
            }
        }
        if (ttlSeconds < 1 || ttlSeconds > Integer.MAX_VALUE) throw new IllegalArgumentException("TTL invalido");
        this.logoutUrl = logoutUrl;
        this.ttlSeconds = ttlSeconds;
        this.secureCookie = secureCookie;
    }

    @GetMapping({"/auth/govbr/start", "/admin/login"})
    public void start(HttpServletResponse response) throws IOException {
        response.sendRedirect("/auth/govbr/login");
    }

    @GetMapping("/auth/govbr/login")
    public void login(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String state = random(), verifier = random();
        var session = request.getSession(true);
        session.setMaxInactiveInterval((int) ttlSeconds);
        session.setAttribute(PENDING, new PendingLogin(state, verifier, Instant.now().plusSeconds(300)));
        response.sendRedirect(govbr.authorize(state, challenge(verifier)));
    }

    @GetMapping("/auth/govbr/callback")
    public void callback(HttpServletRequest request, HttpServletResponse response) throws IOException {
        var session = request.getSession(false);
        PendingLogin pending = null;
        if (session != null) {
            synchronized (session) {
                if (session.getAttribute(PENDING) instanceof PendingLogin value) pending = value;
                session.removeAttribute(PENDING);
            }
        }
        try {
            if (request.getParameterMap().containsKey("access_token")) fail(HttpStatus.BAD_REQUEST);
            if (request.getParameterMap().containsKey("error")) fail(HttpStatus.UNAUTHORIZED);
            String code = single(request, "code"), state = single(request, "state");
            if (pending == null || code == null || state == null) fail(HttpStatus.BAD_REQUEST);
            if (!Instant.now().isBefore(pending.expiresAt()) || !MessageDigest.isEqual(
                    state.getBytes(StandardCharsets.UTF_8), pending.state().getBytes(StandardCharsets.UTF_8))) {
                fail(HttpStatus.UNAUTHORIZED);
            }
            var identity = govbr.identity(code, pending.verifier());
            var admin = admins.lookupLogin((String) identity.get("cpf")).admin();
            if (admin == null || !admin.ativo()) fail(HttpStatus.FORBIDDEN);
            authorization.requireActive(admin.id());
            admins.updateLastLogin(admin.id());
            session.invalidate();
            var authenticatedSession = request.getSession(true);
            authenticatedSession.setMaxInactiveInterval((int) ttlSeconds);
            Instant now = Instant.now();
            authenticatedSession.setAttribute("ADMIN_EXPIRES_AT", now.plusSeconds(ttlSeconds));
            var principal = new AdminPrincipal(admin.id(), (String) identity.get("sub"), now,
                    admin.nome() == null ? "" : admin.nome().strip(), admin.email() == null ? "" : admin.email().strip());
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null,
                    List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
            SecurityContextHolder.setContext(context);
            contexts.saveContext(context, request, response);
            response.sendRedirect("/admin/dashboard");
        } catch (RuntimeException failure) {
            SecurityContextHolder.clearContext();
            var failedSession = request.getSession(false);
            if (failedSession != null) failedSession.invalidate();
            if (failure instanceof ResponseStatusException status) throw status;
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Autenticacao indisponivel");
        }
    }

    @PostMapping("/auth/govbr/logout")
    public void logout(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String source = request.getHeader("Origin");
        if (source == null) source = request.getHeader("Referer");
        try {
            URI uri = URI.create(source == null ? "" : source);
            if (!origin.equals(uri.getScheme() + "://" + uri.getRawAuthority())) fail(HttpStatus.FORBIDDEN);
        } catch (IllegalArgumentException invalid) {
            fail(HttpStatus.FORBIDDEN);
        }
        new org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler()
                .logout(request, response, SecurityContextHolder.getContext().getAuthentication());
        var cookie = org.springframework.http.ResponseCookie.from("ATESTA_ADMIN_SESSION", "")
                .path("/").httpOnly(true).sameSite("Lax").secure(secureCookie)
                .maxAge(0).build();
        response.addHeader("Set-Cookie", cookie.toString());
        response.sendRedirect(logoutUrl);
    }

    private static String single(HttpServletRequest request, String name) {
        String[] values = request.getParameterValues(name);
        return values != null && values.length == 1 && !values[0].isBlank() ? values[0] : null;
    }

    private static void fail(HttpStatus status) {
        throw new ResponseStatusException(status, "Autenticacao administrativa recusada");
    }

    private static String random() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String challenge(String verifier) {
        try {
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 indisponivel");
        }
    }
}
