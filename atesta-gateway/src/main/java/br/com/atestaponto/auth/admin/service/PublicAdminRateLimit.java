package br.com.atestaponto.auth.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.net.InetAddress;
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
    public record Reservation(long hits, long ttl, String generation) {}
    private record LocalCounter(long hits, long expires) {}
    private static final long WINDOW_MS = 900_000;
    // Mesmo hash/TTL do Express: cotas continuam compartilhadas durante a migracao.
    private static final String INCREMENT = """
            if redis.call('EXISTS', KEYS[1]) == 0 then
              local now = redis.call('TIME')
              redis.call('HSET', KEYS[1], 'hits', 0, 'generation', now[1] .. ':' .. now[2])
            end
            if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
            return {redis.call('HINCRBY', KEYS[1], 'hits', 1), redis.call('PTTL', KEYS[1]), redis.call('HGET', KEYS[1], 'generation')}
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
            @Value("${RATE_LIMIT_IP_MAX:2000}") int ipLimit) {
        local = !redisEnabled && !nodeEnv.strip().equalsIgnoreCase("production");
        this.redis = redis; this.json = json; this.secret = secret.trim().getBytes(StandardCharsets.UTF_8);
        String safeNamespace = namespace == null ? (nodeEnv.strip().equalsIgnoreCase("production") ? "atestaponto:production" : "atestaponto:local") : namespace.strip();
        if (safeNamespace.length() > 128 || !safeNamespace.matches("[A-Za-z0-9][A-Za-z0-9_-]*(?::[A-Za-z0-9][A-Za-z0-9_-]*)*")) throw new IllegalArgumentException("REDIS_NAMESPACE invalido");
        if (ipLimit < 100 || ipLimit > 100000 || secret.isBlank()) throw new IllegalArgumentException("Configuracao de limite invalida");
        prefix = safeNamespace + ":ponto:rate_limit:";
        this.ipLimit = ipLimit;
    }

    public int ipLimit() { return ipLimit; }

    public Reservation increment(String name, Object subject) { return increment(name, subject, WINDOW_MS); }

    public Reservation reserve(String name, Object subject, int max, HttpServletResponse response) {
        return reserve(name, subject, max, WINDOW_MS, response);
    }

    // Incrementa e publica RateLimit/RateLimit-Policy; acima do limite tambem define Retry-After.
    public Reservation reserve(String name, Object subject, int max, long windowMs, HttpServletResponse response) {
        var value = increment(name, subject, windowMs);
        headers(name, value, max, windowMs, response);
        if (value.hits() > max) retryAfter(value, response);
        return value;
    }

    public static void headers(String name, Reservation value, int max, long windowMs, HttpServletResponse response) {
        long seconds = Math.max(1, (Math.max(0, value.ttl()) + 999) / 1000);
        response.addHeader("RateLimit", "\"" + name + "\"; r=" + Math.max(0, max - value.hits()) + "; t=" + seconds);
        response.addHeader("RateLimit-Policy", "\"" + name + "\"; q=" + max + "; w=" + ((windowMs + 999) / 1000));
    }

    public static void retryAfter(Reservation value, HttpServletResponse response) {
        response.setHeader("Retry-After", Long.toString(Math.max(1, (value.ttl() + 999) / 1000)));
    }

    public Reservation increment(String name, Object subject, long windowMs) {
        String key = prefix + name + ":" + digest(subject);
        if (local) return incrementLocal(key, windowMs);
        JedisPooled client = redis.getIfAvailable();
        if (client == null) throw new IllegalStateException("Redis de rate limit indisponivel");
        Object response = client.eval(INCREMENT, List.of(key), List.of(Long.toString(windowMs)));
        if (!(response instanceof List<?> values) || values.size() != 3
                || !(values.get(0) instanceof Long hits) || hits < 1
                || !(values.get(1) instanceof Long ttl) || ttl < 0
                || !(values.get(2) instanceof String generation)) throw new IllegalStateException("Estado de rate limit invalido");
        return new Reservation(hits, ttl, generation);
    }

    // counters e o unico estado compartilhado; chamadas Jedis ficam fora de qualquer lock Java.
    private Reservation incrementLocal(String key, long windowMs) {
        synchronized (counters) {
            long now = System.currentTimeMillis();
            counters.values().removeIf(value -> value.expires() <= now);
            LocalCounter previous = counters.get(key);
            if (previous == null && counters.size() >= 10000) throw new IllegalStateException("Limite do armazenamento local atingido");
            var value = previous == null ? new LocalCounter(1, now + windowMs) : new LocalCounter(previous.hits() + 1, previous.expires());
            counters.put(key, value);
            return new Reservation(value.hits(), value.expires() - now, Long.toString(value.expires()));
        }
    }

    public Reservation current(String name, Object subject) {
        String key = prefix + name + ":" + digest(subject);
        if (local) synchronized (counters) {
            var value = counters.get(key);
            long now = System.currentTimeMillis();
            return value == null || value.expires() <= now ? new Reservation(0, 0, "")
                    : new Reservation(value.hits(), value.expires() - now, Long.toString(value.expires()));
        }
        JedisPooled client = redis.getIfAvailable();
        if (client == null) throw new IllegalStateException("Redis de rate limit indisponivel");
        Object result = client.eval("""
                local hits = tonumber(redis.call('HGET', KEYS[1], 'hits') or '0')
                local ttl = redis.call('PTTL', KEYS[1])
                if ttl == -1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
                return {hits, math.max(0, ttl)}
                """, List.of(key), List.of(Long.toString(WINDOW_MS)));
        if (!(result instanceof List<?> values) || values.size() != 2) throw new IllegalStateException("Estado de rate limit invalido");
        long hits = ((Number) values.get(0)).longValue(), ttl = ((Number) values.get(1)).longValue();
        if (hits < 0 || hits > 9007199254740991L || ttl < 0) throw new IllegalStateException("Estado de rate limit invalido");
        return new Reservation(hits, ttl, "");
    }

    public void refund(String name, Object subject, Reservation reservation) {
        String key = prefix + name + ":" + digest(subject);
        if (local) synchronized (counters) {
            var value = counters.get(key);
            if (value != null && Long.toString(value.expires()).equals(reservation.generation()) && value.hits() > 0)
                counters.put(key, new LocalCounter(value.hits() - 1, value.expires()));
            return;
        }
        JedisPooled client = redis.getIfAvailable();
        if (client == null) throw new IllegalStateException("Redis de rate limit indisponivel");
        client.eval("""
                if redis.call('HGET', KEYS[1], 'generation') == ARGV[1]
                  and tonumber(redis.call('HGET', KEYS[1], 'hits') or '0') > 0 then
                    return redis.call('HINCRBY', KEYS[1], 'hits', -1)
                end
                return 0
                """, List.of(key), List.of(reservation.generation()));
    }

    // IPv4 exato; IPv6 agrupado por /56. O IP ja vem resolvido pelo RemoteIpValve.
    public static String ipSubject(String ip) {
        if (ip == null || !ip.matches("[0-9a-fA-F:.%]+")) return "unknown-ip";
        if (!ip.contains(":")) return ip;
        try {
            byte[] bytes = InetAddress.getByName(ip).getAddress();
            if (bytes.length == 4) return InetAddress.getByAddress(bytes).getHostAddress();
            java.util.Arrays.fill(bytes, 7, 16, (byte) 0);
            int[] groups = new int[8];
            for (int i = 0; i < 8; i++) groups[i] = (bytes[i * 2] & 255) * 256 + (bytes[i * 2 + 1] & 255);
            int best = -1, length = 1;
            for (int i = 0; i < 8;) {
                if (groups[i] != 0) { i++; continue; }
                int start = i;
                while (i < 8 && groups[i] == 0) i++;
                if (i - start > length) { best = start; length = i - start; }
            }
            var result = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                if (i == best) { result.append("::"); i += length - 1; continue; }
                if (!result.isEmpty() && result.charAt(result.length() - 1) != ':') result.append(':');
                result.append(Integer.toHexString(groups[i]));
            }
            return result + "/56";
        } catch (java.net.UnknownHostException invalid) { return "unknown-ip"; }
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
