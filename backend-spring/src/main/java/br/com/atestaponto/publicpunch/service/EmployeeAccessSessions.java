package br.com.atestaponto.publicpunch.service;

import br.com.atestaponto.schoolqr.service.SchoolQrService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import redis.clients.jedis.JedisPooled;
import redis.clients.jedis.params.SetParams;

/** Cookies e serializacao Express, separados da sessao administrativa. */
@Service
public class EmployeeAccessSessions {
    private static final long TTL = 900_000;
    private static final String CAS = """
            local current = redis.call('GET', KEYS[1])
            if current ~= ARGV[1] or redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
            redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
            return 1
            """;
    private record Local(String value, long expires) {}
    public record Snapshot(String key, String raw, ObjectNode data) {
        @Override public String toString() { return "Session[redacted]"; }
    }
    private final ObjectProvider<JedisPooled> redis;
    private final ObjectMapper json;
    private final SchoolQrService qr;
    private final byte[] secret;
    private final String prefix;
    private final boolean secure, local;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Local> sessions = new ConcurrentHashMap<>();

    public EmployeeAccessSessions(ObjectProvider<JedisPooled> redis, ObjectMapper json, SchoolQrService qr, Environment env) {
        this.redis = redis; this.json = json; this.qr = qr;
        String value = env.getRequiredProperty("SESSION_SECRET").strip();
        if (value.length() < 32) throw new IllegalArgumentException("SESSION_SECRET invalido");
        secret = value.getBytes(StandardCharsets.UTF_8);
        secure = env.getProperty("NODE_ENV", "development").strip().equalsIgnoreCase("production");
        local = !secure && !env.getProperty("REDIS_ENABLED", Boolean.class, false);
        String namespace = env.getProperty("REDIS_NAMESPACE", secure ? "atestaponto:production" : "atestaponto:local").strip();
        if (namespace.length() > 128 || !namespace.matches("[A-Za-z0-9][A-Za-z0-9_-]*(?::[A-Za-z0-9][A-Za-z0-9_-]*)*"))
            throw new IllegalArgumentException("REDIS_NAMESPACE invalido");
        prefix = namespace + ":ponto:session:";
    }

    public Long qrUnit(HttpServletRequest request, HttpServletResponse response) {
        String sid = sid(request, "ponto_qr_acesso");
        if (sid == null) return null;
        Snapshot stored = read(sid);
        if (stored == null || expired(stored.data())) {
            clearCookie(response, "ponto_qr_acesso");
            return null;
        }
        JsonNode token = stored.data().path("funcionario_qr").get("token");
        if (token == null) return null;
        var resolved = qr.resolve(token);
        if (resolved == null) {
            stored.data().remove("funcionario_qr");
            replace(stored);
            clearCookie(response, "ponto_qr_acesso");
            throw new PublicPunchException(403, "FORBIDDEN", "QR Code invalido ou revogado");
        }
        return resolved.unidade_escolar_id();
    }

    public Snapshot recovery(HttpServletRequest request) {
        String sid = sid(request, "ponto_recovery");
        Snapshot stored = sid == null ? null : read(sid);
        if (stored == null || expired(stored.data()) || !stored.data().path("passwordRecovery").isObject()
                || stored.data().path("passwordRecovery").path("expiresAt").asLong(0) < System.currentTimeMillis())
            throw EmployeeJwt.denied("Código inválido ou expirado.");
        return stored;
    }

    public void createRecovery(HttpServletRequest request, HttpServletResponse response, ObjectNode recovery) {
        String previous = sid(request, "ponto_recovery");
        if (previous != null) delete(key(previous));
        byte[] bytes = new byte[24]; random.nextBytes(bytes);
        String sid = EmployeeJwt.encode(bytes);
        var data = json.createObjectNode();
        data.putObject("cookie").put("expires", Instant.now().plusMillis(TTL).toString())
                .put("originalMaxAge", TTL).put("httpOnly", true).put("sameSite", "lax").put("secure", secure).put("path", "/");
        data.set("passwordRecovery", recovery);
        String serialized = data.toString();
        if (local) {
            synchronized (sessions) {
                sessions.values().removeIf(s -> s.expires() <= System.currentTimeMillis());
                if (sessions.size() >= 10000) throw new IllegalStateException("Armazenamento de recuperacao indisponivel");
                sessions.put(key(sid), new Local(serialized, System.currentTimeMillis() + TTL));
            }
        } else client().set(key(sid), serialized, SetParams.setParams().px(TTL));
        String signed = "s:" + sid + "." + signature(sid);
        response.addHeader("Set-Cookie", ResponseCookie.from("ponto_recovery", java.net.URLEncoder.encode(signed, StandardCharsets.UTF_8))
                .path("/").httpOnly(true).sameSite("Lax").secure(secure).maxAge(TTL / 1000).build().toString());
    }

    public boolean replace(Snapshot snapshot) {
        if (local) {
            synchronized (sessions) {
                Local current = sessions.get(snapshot.key());
                if (current == null || current.expires() <= System.currentTimeMillis() || !current.value().equals(snapshot.raw())) return false;
                sessions.put(snapshot.key(), new Local(snapshot.data().toString(), current.expires()));
                return true;
            }
        }
        return Long.valueOf(1).equals(client().eval(CAS, List.of(snapshot.key()), List.of(snapshot.raw(), snapshot.data().toString())));
    }

    private Snapshot read(String sid) {
        String key = key(sid), raw;
        if (local) {
            Local value = sessions.get(key);
            raw = value == null || value.expires() <= System.currentTimeMillis() ? null : value.value();
        } else raw = client().get(key);
        if (raw == null) return null;
        try {
            JsonNode data = json.readTree(raw);
            return data instanceof ObjectNode object ? new Snapshot(key, raw, object) : null;
        } catch (java.io.IOException e) { return null; }
    }
    private static boolean expired(ObjectNode data) {
        try { return !Instant.parse(data.path("cookie").path("expires").asText()).isAfter(Instant.now()); }
        catch (RuntimeException invalid) { return true; }
    }
    private String sid(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (var cookie : request.getCookies()) {
            if (!cookie.getName().equals(name)) continue;
            try {
                String value = java.net.URLDecoder.decode(cookie.getValue(), StandardCharsets.UTF_8);
                if (!value.startsWith("s:") || value.length() > 256) return null;
                int dot = value.lastIndexOf('.');
                String sid = value.substring(2, dot);
                if (!sid.matches("[A-Za-z0-9_-]{24,128}")) return null;
                if (MessageDigest.isEqual(signature(sid).getBytes(StandardCharsets.US_ASCII), value.substring(dot + 1).getBytes(StandardCharsets.US_ASCII))) return sid;
            } catch (RuntimeException invalid) { return null; }
        }
        return null;
    }
    private String signature(String sid) { return Base64.getEncoder().withoutPadding().encodeToString(EmployeeJwt.mac(secret, sid.getBytes(StandardCharsets.UTF_8), "HmacSHA256")); }
    private String key(String sid) { return prefix + HexFormat.of().formatHex(EmployeeJwt.sha256(sid.getBytes(StandardCharsets.UTF_8))); }
    private void delete(String key) { if (local) sessions.remove(key); else client().del(key); }
    private JedisPooled client() {
        JedisPooled client = redis.getIfAvailable();
        if (client == null) throw new IllegalStateException("Redis de sessao indisponivel");
        return client;
    }
    private void clearCookie(HttpServletResponse response, String name) {
        response.addHeader("Set-Cookie", ResponseCookie.from(name, "").path("/").httpOnly(true).sameSite("Lax").secure(secure).maxAge(0).build().toString());
    }
}
