package br.com.atestaponto.schoolqr.repository;

import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Repository;
import redis.clients.jedis.JedisPooled;

@Repository
public class SchoolQrRepository {
    // Os dois indices e a revogacao sao publicados juntos, sem TTL.
    private static final String REGENERATE_SCRIPT = """
            local previousJson = redis.call("GET", KEYS[1])
            if previousJson then
              local previous = cjson.decode(previousJson)
              if previous.tokenHash then
                redis.call("DEL", ARGV[3] .. previous.tokenHash)
              end
            end
            redis.call("SET", KEYS[1], ARGV[1])
            redis.call("SET", KEYS[2], ARGV[2])
            return 1
            """;

    private final ObjectProvider<JedisPooled> redis;

    public SchoolQrRepository(ObjectProvider<JedisPooled> redis) { this.redis = redis; }

    public String get(String key) { return client().get(key); }

    public void regenerate(String unitKey, String tokenKey, String record,
            String unitId, String tokenPrefix) {
        Object result = client().eval(REGENERATE_SCRIPT,
                List.of(unitKey, tokenKey), List.of(record, unitId, tokenPrefix));
        if (!Long.valueOf(1).equals(result)) {
            throw new IllegalStateException("Falha ao regenerar QR escolar");
        }
    }

    private JedisPooled client() {
        JedisPooled client = redis.getIfAvailable();
        if (client == null) throw new IllegalStateException("Redis do QR escolar desabilitado");
        return client;
    }
}
