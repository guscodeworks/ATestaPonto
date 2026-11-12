package br.com.atestaponto.publicpunch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class EmployeeJwtTest {

    private static final String SECRET = "test-secret-with-at-least-32-characters";
    private final ObjectMapper json = new ObjectMapper();
    private final EmployeeJwt jwt = new EmployeeJwt(json, new MockEnvironment().withProperty("JWT_SECRET", SECRET));

    private static void assertDenied(Runnable call) {
        assertEquals(401, assertThrows(PublicPunchException.class, call::run).status());
    }

    private static String sign(String header, String claims, byte[] key) {
        String input = EmployeeJwt.encode(header.getBytes(StandardCharsets.UTF_8)) + "."
                + EmployeeJwt.encode(claims.getBytes(StandardCharsets.UTF_8));
        return input + "." + EmployeeJwt.encode(EmployeeJwt.mac(key, input.getBytes(StandardCharsets.US_ASCII), "HmacSHA256"));
    }

    @Test
    void rejectsWeakOrSharedSecret() {
        assertThrows(IllegalArgumentException.class,
                () -> new EmployeeJwt(json, new MockEnvironment().withProperty("JWT_SECRET", "short")));
        assertThrows(IllegalArgumentException.class, () -> new EmployeeJwt(json, new MockEnvironment()
                .withProperty("JWT_SECRET", SECRET).withProperty("SESSION_SECRET", SECRET)));
    }

    @Test
    void issuedTokenRoundTrips() {
        var claims = jwt.verify("Bearer " + jwt.issue(42, "hash", false), false);
        assertEquals(42, jwt.id(claims, false));
        assertEquals("funcionario", claims.get("role").asText());
        assertEquals(jwt.version(42, "hash"), claims.get("credentialVersion").asText());
    }

    @Test
    void rejectsTamperedMissingOrMalformedToken() {
        String token = jwt.issue(42, "hash", false);
        assertDenied(() -> jwt.verify(null, false));
        assertDenied(() -> jwt.verify(token, false));
        assertDenied(() -> jwt.verify("Bearer " + token + "x", false));
        assertDenied(() -> jwt.verify("Bearer a.b", false));
    }

    @Test
    void rejectsAlgNone() {
        String header = EmployeeJwt.encode("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String claims = EmployeeJwt.encode(("{\"sub\":\"42\",\"exp\":" + (Instant.now().getEpochSecond() + 600) + "}")
                .getBytes(StandardCharsets.UTF_8));
        assertDenied(() -> jwt.verify("Bearer " + header + "." + claims + ".", false));
    }

    @Test
    void rejectsExpiredToken() {
        String token = sign("{\"alg\":\"HS256\"}", "{\"sub\":\"42\",\"exp\":" + (Instant.now().getEpochSecond() - 1) + "}",
                SECRET.getBytes(StandardCharsets.UTF_8));
        var error = assertThrows(PublicPunchException.class, () -> jwt.verify("Bearer " + token, false));
        assertEquals("Sessao expirada. Faca login novamente.", error.getMessage());
    }

    @Test
    void firstAccessAndSessionTokensAreNotInterchangeable() {
        String session = jwt.issue(42, "hash", false);
        String first = jwt.issue(42, "hash", true);
        assertEquals(42, jwt.id(jwt.verify("Bearer " + first, true), true));
        assertDenied(() -> jwt.verify("Bearer " + session, true));
        assertDenied(() -> jwt.verify("Bearer " + first, false));
    }

    @Test
    void rejectsInvalidSubject() {
        long exp = Instant.now().getEpochSecond() + 600;
        byte[] key = SECRET.getBytes(StandardCharsets.UTF_8);
        assertDenied(() -> jwt.verify("Bearer " + sign("{\"alg\":\"HS256\"}", "{\"sub\":\"0\",\"exp\":" + exp + "}", key), false));
        assertDenied(() -> jwt.verify("Bearer " + sign("{\"alg\":\"HS256\"}", "{\"sub\":\"abc\",\"exp\":" + exp + "}", key), false));
    }
}
