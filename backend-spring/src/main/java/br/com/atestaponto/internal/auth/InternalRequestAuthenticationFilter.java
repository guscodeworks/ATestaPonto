package br.com.atestaponto.internal.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Collections;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class InternalRequestAuthenticationFilter extends OncePerRequestFilter {

    private static final int MAX_BODY_BYTES = 100 * 1024;
    private final SecretKeySpec key;
    private final long maxClockSkewSeconds;
    private final InternalRequestReplayCache replayCache;

    public InternalRequestAuthenticationFilter(
            @Value("${internal.auth.shared-key}") String sharedKey,
            @Value("${internal.auth.max-clock-skew-seconds}") long maxClockSkewSeconds,
            InternalRequestReplayCache replayCache) {
        byte[] keyBytes = sharedKey.trim().getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32 || maxClockSkewSeconds < 1 || maxClockSkewSeconds > 120) {
            throw new IllegalArgumentException("Configuracao de autenticacao interna invalida");
        }
        this.key = new SecretKeySpec(keyBytes, "HmacSHA256");
        this.maxClockSkewSeconds = maxClockSkewSeconds;
        this.replayCache = replayCache;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Servlet path já é decodificado pelo container; protege também paths codificados.
        String path = request.getServletPath();
        return !(path.equals("/internal") || path.startsWith("/internal/")
                || path.startsWith("/internal;"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String timestamp = request.getHeader("X-Internal-Timestamp");
        String signature = request.getHeader("X-Internal-Signature");
        String requestId = request.getHeader("X-Internal-Request-Id");
        if (Collections.list(request.getHeaders("X-Internal-Timestamp")).size() != 1
                || Collections.list(request.getHeaders("X-Internal-Signature")).size() != 1
                || Collections.list(request.getHeaders("X-Internal-Request-Id")).size() != 1
                || timestamp == null || !timestamp.matches("[0-9]{1,12}")
                || requestId == null
                || !requestId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
                || signature == null || !signature.matches("[0-9a-fA-F]{64}")) {
            reject(response);
            return;
        }
        long signedAt = Long.parseLong(timestamp);
        long now = Instant.now().getEpochSecond();
        if (signedAt < now - maxClockSkewSeconds || signedAt > now + maxClockSkewSeconds) {
            reject(response);
            return;
        }

        byte[] body;
        try (ServletInputStream input = request.getInputStream()) {
            body = input.readNBytes(MAX_BODY_BYTES + 1);
        }
        if (body.length > MAX_BODY_BYTES) {
            response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            return;
        }
        try {
            String bodyHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
            String target = request.getRequestURI();
            if (request.getQueryString() != null) {
                target += "?" + request.getQueryString();
            }
            String canonical = String.join("\n", request.getMethod().toUpperCase(Locale.ROOT),
                    target, timestamp, requestId, bodyHash);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            byte[] expected = mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8));
            if (!MessageDigest.isEqual(expected, HexFormat.of().parseHex(signature))) {
                reject(response);
                return;
            }
        } catch (GeneralSecurityException exception) {
            throw new ServletException("Falha na autenticacao interna", exception);
        }
        if (!replayCache.accept(UUID.fromString(requestId))) {
            reject(response);
            return;
        }
        chain.doFilter(new SignedBodyRequest(request, body), response);
    }

    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"Requisicao interna nao autenticada\"}");
    }
}
