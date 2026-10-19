package br.com.atestaponto.publicpunch.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Service
public class EmployeeJwt {
    private final ObjectMapper json;
    private final byte[] secret, firstSecret;
    private final String expires, firstExpires;
    public EmployeeJwt(ObjectMapper json, Environment env) {
        this.json = json;
        String key = env.getRequiredProperty("JWT_SECRET");
        if (key.strip().length() < 32 || key.strip().equals(env.getProperty("SESSION_SECRET", "").strip()))
            throw new IllegalArgumentException("JWT_SECRET invalido");
        secret = key.strip().getBytes(StandardCharsets.UTF_8);
        firstSecret = sha256((key.strip() + ":first-access-password-change:v1").getBytes(StandardCharsets.UTF_8));
        expires = normalizeExpiry(env.getProperty("FUNCIONARIO_JWT_EXPIRES_IN", "20m"));
        firstExpires = normalizeExpiry(env.getProperty("FIRST_ACCESS_TOKEN_EXPIRES_IN", "10m"));
        if (seconds(expires) <= 0 || seconds(firstExpires) < 60 || seconds(firstExpires) > 900)
            throw new IllegalArgumentException("Expiracao JWT invalida");
    }
    public String expires(boolean first) { return first ? firstExpires : expires; }
    public String version(long id, String hash) {
        if (hash == null || hash.isEmpty()) throw denied("Credencial indisponivel. Faca login novamente.");
        try { return HexFormat.of().formatHex(mac(secret, json.writeValueAsBytes(java.util.List.of("employee-credential-v1", Long.toString(id), hash)), "HmacSHA256")); }
        catch (java.io.IOException e) { throw new IllegalStateException(e); }
    }
    public String issue(long id, String hash, boolean first) {
        var claims = new LinkedHashMap<String, Object>();
        claims.put("sub", Long.toString(id));
        if (first) claims.put("purpose", "primeira_troca_senha");
        else { claims.put("role", "funcionario"); claims.put("credentialVersion", version(id, hash)); }
        long now = Instant.now().getEpochSecond();
        claims.put("iat", now); claims.put("exp", now + seconds(expires(first)));
        try {
            String input = encode(json.writeValueAsBytes(Map.of("alg", "HS256", "typ", "JWT"))) + "." + encode(json.writeValueAsBytes(claims));
            return input + "." + encode(mac(first ? firstSecret : secret, input.getBytes(StandardCharsets.US_ASCII), "HmacSHA256"));
        } catch (java.io.IOException e) { throw new IllegalStateException(e); }
    }
    public JsonNode verify(String authorization, boolean first) {
        try {
            if (authorization == null || !authorization.matches("(?i)Bearer [^ ]+")) throw new IllegalArgumentException();
            String token = authorization.substring(7);
            if (token.length() > 8192) throw new IllegalArgumentException();
            String[] parts = token.split("\\.", -1);
            if (parts.length != 3) throw new IllegalArgumentException();
            var decoder = Base64.getUrlDecoder();
            JsonNode header = json.readTree(decoder.decode(parts[0]));
            String alg = header.path("alg").asText();
            String algorithm = switch (alg) { case "HS256" -> "HmacSHA256"; case "HS384" -> "HmacSHA384"; case "HS512" -> "HmacSHA512"; default -> throw new IllegalArgumentException(); };
            if (first && !alg.equals("HS256")) throw new IllegalArgumentException();
            if (!MessageDigest.isEqual(decoder.decode(parts[2]), mac(first ? firstSecret : secret,
                    (parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII), algorithm))) throw new IllegalArgumentException();
            JsonNode claims = json.readTree(decoder.decode(parts[1]));
            long now = Instant.now().getEpochSecond();
            if (claims.has("nbf") && (!claims.get("nbf").isNumber() || claims.get("nbf").doubleValue() > now)) throw new IllegalArgumentException();
            if (claims.has("exp") && !claims.get("exp").isNumber()) throw new IllegalArgumentException();
            if (claims.has("exp") && claims.get("exp").doubleValue() <= now)
                throw denied(first ? "Comprovante de primeiro acesso invalido" : "Sessao expirada. Faca login novamente.");
            if (first && (!claims.has("exp") || !claims.path("purpose").asText().equals("primeira_troca_senha"))) throw new IllegalArgumentException();
            id(claims, first);
            return claims;
        } catch (PublicPunchException e) { throw e; }
        catch (Exception e) { throw denied(first ? "Comprovante de primeiro acesso invalido" : "Sessao do funcionario invalida"); }
    }
    public long id(JsonNode claims, boolean first) {
        String value = claims.path("sub").asText(claims.path("id").asText(""));
        try {
            long id = Long.parseLong(value);
            if (id <= 0 || id > 9007199254740991L) throw new IllegalArgumentException();
            return id;
        } catch (RuntimeException e) { throw denied(first ? "Comprovante de primeiro acesso invalido" : "Sessao do funcionario invalida"); }
    }
    private static String normalizeExpiry(String value) {
        value = value.strip();
        return value.matches("[0-9]+") ? value + "s" : value;
    }
    static long seconds(String value) {
        if (!value.matches("[0-9]+[smhd]")) throw new IllegalArgumentException("Expiracao JWT invalida");
        long amount = Long.parseLong(value.substring(0, value.length() - 1));
        return Math.multiplyExact(amount, switch (value.charAt(value.length() - 1)) {
            case 's' -> 1; case 'm' -> 60; case 'h' -> 3600; case 'd' -> 86400; default -> throw new IllegalArgumentException();
        });
    }
    static byte[] mac(byte[] key, byte[] data, String algorithm) {
        try { Mac mac = Mac.getInstance(algorithm); mac.init(new SecretKeySpec(key, algorithm)); return mac.doFinal(data); }
        catch (java.security.GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    static byte[] sha256(byte[] data) {
        try { return MessageDigest.getInstance("SHA-256").digest(data); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    static String encode(byte[] data) { return Base64.getUrlEncoder().withoutPadding().encodeToString(data); }
    static PublicPunchException denied(String message) { return new PublicPunchException(401, "UNAUTHORIZED", message); }
}
