package br.com.atestaponto.internal.auth;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class InternalRequestAuthenticationFilterTest {

    private static final String KEY = "internal-test-key-with-at-least-32-bytes";
    private final InternalRequestReplayCache cache = new InternalRequestReplayCache(30);
    private final InternalRequestAuthenticationFilter filter = new InternalRequestAuthenticationFilter(KEY, 30, cache);

    @AfterEach
    void close() {
        cache.close();
    }

    private static MockHttpServletRequest signed(String uri, String body, long timestamp, String requestId) throws Exception {
        var request = new MockHttpServletRequest("POST", uri);
        request.setServletPath(uri);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        String bodyHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.getContentAsByteArray()));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(KEY.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String canonical = String.join("\n", "POST", uri, Long.toString(timestamp), requestId, bodyHash);
        request.addHeader("X-Internal-Timestamp", Long.toString(timestamp));
        request.addHeader("X-Internal-Request-Id", requestId);
        request.addHeader("X-Internal-Signature", HexFormat.of().formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8))));
        return request;
    }

    private MockFilterChain run(MockHttpServletRequest request, int expectedStatus) throws Exception {
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();
        filter.doFilter(request, response, chain);
        assertEquals(expectedStatus, response.getStatus());
        return chain;
    }

    @Test
    void rejectsWeakKey() {
        assertThrows(IllegalArgumentException.class, () -> new InternalRequestAuthenticationFilter("short", 30, cache));
    }

    @Test
    void acceptsValidSignatureAndPreservesBody() throws Exception {
        var chain = run(signed("/internal/x", "{\"a\":1}", Instant.now().getEpochSecond(), UUID.randomUUID().toString()), 200);
        assertArrayEquals("{\"a\":1}".getBytes(StandardCharsets.UTF_8), chain.getRequest().getInputStream().readAllBytes());
    }

    @Test
    void rejectsMissingHeaders() throws Exception {
        var request = new MockHttpServletRequest("GET", "/internal/x");
        request.setServletPath("/internal/x");
        assertNull(run(request, 401).getRequest());
    }

    @Test
    void rejectsTamperedBody() throws Exception {
        var request = signed("/internal/x", "{\"a\":1}", Instant.now().getEpochSecond(), UUID.randomUUID().toString());
        request.setContent("{\"a\":2}".getBytes(StandardCharsets.UTF_8));
        assertNull(run(request, 401).getRequest());
    }

    @Test
    void rejectsStaleTimestamp() throws Exception {
        assertNull(run(signed("/internal/x", "", Instant.now().getEpochSecond() - 31, UUID.randomUUID().toString()), 401).getRequest());
    }

    @Test
    void rejectsReplay() throws Exception {
        String requestId = UUID.randomUUID().toString();
        long now = Instant.now().getEpochSecond();
        run(signed("/internal/x", "", now, requestId), 200);
        assertNull(run(signed("/internal/x", "", now, requestId), 401).getRequest());
    }

    @Test
    void protectsInternalPathVariants() throws Exception {
        for (String path : new String[] {"/internal", "/internal;x"}) {
            var request = new MockHttpServletRequest("GET", path);
            request.setServletPath(path);
            assertNull(run(request, 401).getRequest());
        }
        var publicRequest = new MockHttpServletRequest("GET", "/api/x");
        publicRequest.setServletPath("/api/x");
        run(publicRequest, 200);
    }
}
