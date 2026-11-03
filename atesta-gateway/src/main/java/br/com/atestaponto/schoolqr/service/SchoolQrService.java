package br.com.atestaponto.schoolqr.service;

import br.com.atestaponto.schoolqr.dto.SchoolQrResponse;
import br.com.atestaponto.schoolqr.repository.SchoolQrRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SchoolQrService {
    private final SchoolQrRepository repository;
    private final ObjectMapper json;
    private final SecureRandom random = new SecureRandom();
    private final String unitPrefix;
    private final String tokenPrefix;

    public SchoolQrService(SchoolQrRepository repository, ObjectMapper json,
            @Value("${REDIS_NAMESPACE:#{null}}") String namespace,
            @Value("${NODE_ENV:development}") String nodeEnv) {
        this.repository = repository;
        this.json = json;
        String safeNamespace = namespace == null
                ? (trim(nodeEnv).equalsIgnoreCase("production") ? "atestaponto:production" : "atestaponto:local")
                : trim(namespace);
        if (safeNamespace.length() > 128
                || !safeNamespace.matches("[A-Za-z0-9][A-Za-z0-9_-]*(?::[A-Za-z0-9][A-Za-z0-9_-]*)*")) {
            throw new IllegalArgumentException("REDIS_NAMESPACE invalido");
        }
        unitPrefix = safeNamespace + ":ponto:qr:unit:";
        tokenPrefix = safeNamespace + ":ponto:qr:token:";
    }

    public SchoolQrResponse.Qr generate(JsonNode rawId, String baseUrl) {
        long id = schoolId(rawId);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
        String tokenHash = hash(token);
        try {
            String record = json.writeValueAsString(new StoredQr(token, tokenHash));
            repository.regenerate(unitKey(id), tokenPrefix + tokenHash, record, Long.toString(id), tokenPrefix);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Falha ao serializar QR escolar", error);
        }
        return qr(id, token, baseUrl);
    }

    public SchoolQrResponse.Qr current(JsonNode rawId, String baseUrl) {
        long id = schoolId(rawId);
        StoredQr record = parseRecord(repository.get(unitKey(id)));
        return record == null ? null : qr(id, record.token(), baseUrl);
    }

    public SchoolQrResponse.Unit resolve(JsonNode rawToken) {
        if (rawToken == null || !rawToken.isTextual() || !validToken(rawToken.textValue())) return null;
        String tokenHash = hash(trim(rawToken.textValue()));
        String storedId = repository.get(tokenPrefix + tokenHash);
        if (storedId == null) return null;
        long id;
        try {
            id = Long.parseLong(storedId);
        } catch (NumberFormatException error) {
            return null;
        }
        if (id < 1) return null;
        StoredQr current = parseRecord(repository.get(unitKey(id)));
        return current == null || !current.tokenHash().equals(tokenHash) ? null : new SchoolQrResponse.Unit(id);
    }

    private static long schoolId(JsonNode value) {
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 1) {
            throw new IllegalArgumentException("unidade_escolar_id invalido");
        }
        return value.longValue();
    }

    private String unitKey(long id) { return unitPrefix + hash(Long.toString(id)); }

    private StoredQr parseRecord(String value) {
        if (value == null) return null;
        try {
            JsonNode record = json.readTree(value);
            if (record == null || !record.path("token").isTextual() || !record.path("tokenHash").isTextual()) return null;
            String token = record.path("token").textValue();
            String tokenHash = record.path("tokenHash").textValue();
            return validToken(token) && hash(trim(token)).equals(tokenHash) ? new StoredQr(token, tokenHash) : null;
        } catch (JsonProcessingException error) {
            return null;
        }
    }

    private static boolean validToken(String token) { return token != null && trim(token).matches("[a-fA-F0-9]{64}"); }

    // Mesmos caracteres removidos por String.trim() do JavaScript, inclusive BOM e NBSP.
    private static String trim(String value) {
        return value.replaceAll("^[\\s\\p{Z}\\uFEFF]+|[\\s\\p{Z}\\uFEFF]+$", "");
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 indisponivel", error);
        }
    }

    private static SchoolQrResponse.Qr qr(long id, String token, String baseUrl) {
        String base = baseUrl == null ? "" : trim(baseUrl).replaceAll("/+$", "");
        String encoded = java.net.URLEncoder.encode(token, StandardCharsets.UTF_8).replace("+", "%20");
        return new SchoolQrResponse.Qr(id, base + "/ponto/acessar?qr=" + encoded);
    }

    private record StoredQr(String token, String tokenHash) {}
}
