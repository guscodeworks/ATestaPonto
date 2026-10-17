package br.com.atestaponto.auth.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import redis.clients.jedis.JedisPooled;

@Service
public class PublicAdminRateLimit {
    public record Reservation(long hits, long ttl) {}
    private record LocalCounter(long hits, long expires) {}
    private static final long WINDOW_MS = 900_000;
    // Mesmo hash/TTL do Express: cotas continuam compartilhadas durante a migracao.
    private static final String INCREMENT = """
            if redis.call('EXISTS', KEYS[1]) == 0 then
              local now = redis.call('TIME')
              redis.call('HSET', KEYS[1], 'hits', 0, 'generation', now[1] .. ':' .. now[2])
            end
            if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
            return {redis.call('HINCRBY', KEYS[1], 'hits', 1), redis.call('PTTL', KEYS[1])}
            """;
    private final ObjectProvider<JedisPooled> redis;
    private final ObjectMapper json;
    private final byte[] secret;
    private final String prefix;
    private final boolean local;
    private final int ipLimit;
    private final Map<String, LocalCounter> counters = new HashMap<>();

    public PublicAdminRateLimit(ObjectProvider<JedisPooled> redis, ObjectMapper json,
            @Value("${SESSION_SECRET:}") String secret,
            @Value("${REDIS_NAMESPACE:#{null}}") String namespace,
            @Value("${NODE_ENV:development}") String nodeEnv,
            @Value("${REDIS_ENABLED:false}") boolean redisEnabled,
            @Value("${RATE_LIMIT_IP_MAX:2000}") int ipLimit,
            @Value("${internal.auth.shared-key}") String internalKey) {
        local = !redisEnabled && !nodeEnv.strip().equalsIgnoreCase("production");
        if (secret.isBlank() && local) secret = internalKey;
        this.redis = redis; this.json = json; this.secret = secret.trim().getBytes(StandardCharsets.UTF_8);
        String safeNamespace = namespace == null ? (nodeEnv.strip().equalsIgnoreCase("production") ? "atestaponto:production" : "atestaponto:local") : namespace.strip();
        if (safeNamespace.length() > 128 || !safeNamespace.matches("[A-Za-z0-9][A-Za-z0-9_-]*(?::[A-Za-z0-9][A-Za-z0-9_-]*)*")) throw new IllegalArgumentException("REDIS_NAMESPACE invalido");
        if (ipLimit < 100 || ipLimit > 100000 || secret.isBlank()) throw new IllegalArgumentException("Configuracao de limite invalida");
        prefix = safeNamespace + ":ponto:rate_limit:";
        this.ipLimit = ipLimit;
    }

    public int ipLimit() { return ipLimit; }

    public Reservation increment(String name, Object subject) {
        String key = prefix + name + ":" + digest(subject);
        if (local) return incrementLocal(key);
        JedisPooled client = redis.getIfAvailable();
        if (client == null) throw new IllegalStateException("Redis de rate limit indisponivel");
        Object response = client.eval(INCREMENT, List.of(key), List.of(Long.toString(WINDOW_MS)));
        if (!(response instanceof List<?> values) || values.size() != 2
                || !(values.get(0) instanceof Long hits) || hits < 1
                || !(values.get(1) instanceof Long ttl) || ttl < 0) throw new IllegalStateException("Estado de rate limit invalido");
        return new Reservation(hits, ttl);
    }

    private synchronized Reservation incrementLocal(String key) {
        long now = System.currentTimeMillis();
        counters.values().removeIf(value -> value.expires() <= now);
        LocalCounter previous = counters.get(key);
        if (previous == null && counters.size() >= 10000) throw new IllegalStateException("Limite do armazenamento local atingido");
        var value = previous == null ? new LocalCounter(1, now + WINDOW_MS) : new LocalCounter(previous.hits() + 1, previous.expires());
        counters.put(key, value);
        return new Reservation(value.hits(), value.expires() - now);
    }

    private String digest(Object subject) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(json.writeValueAsBytes(List.of("rate-limit-v1", subject))));
        } catch (java.security.GeneralSecurityException | java.io.IOException error) {
            throw new IllegalStateException("Falha ao calcular chave de rate limit", error);
        }
    }
}
