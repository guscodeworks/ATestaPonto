package br.com.atestaponto.schoolqr.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import redis.clients.jedis.DefaultJedisClientConfig;
import redis.clients.jedis.HostAndPort;
import redis.clients.jedis.JedisPooled;

@Configuration
public class SchoolQrRedisConfiguration {
    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(name = "REDIS_ENABLED", havingValue = "true")
    public JedisPooled schoolQrRedis(
            @Value("${REDIS_HOST:}") String host,
            @Value("${REDIS_PORT:6379}") int port) {
        if (host.isBlank() || port < 1 || port > 65535) {
            throw new IllegalArgumentException("Configuracao Redis do QR escolar invalida");
        }
        return new JedisPooled(new HostAndPort(host.trim(), port),
                DefaultJedisClientConfig.builder()
                        .connectionTimeoutMillis(2000).socketTimeoutMillis(2000).build());
    }
}
