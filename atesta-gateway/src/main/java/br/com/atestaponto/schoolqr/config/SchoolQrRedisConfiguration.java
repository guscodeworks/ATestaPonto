package br.com.atestaponto.schoolqr.config;

import javax.net.ssl.SSLParameters;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.data.redis.JedisClientConfigurationBuilderCustomizer;
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
            @Value("${REDIS_PORT:6379}") int port,
            @Value("${REDIS_USERNAME:}") String username,
            @Value("${REDIS_PASSWORD:}") String password,
            @Value("${REDIS_TLS:false}") boolean tls) {
        if (host.isBlank() || port < 1 || port > 65535) {
            throw new IllegalArgumentException("Configuracao Redis do QR escolar invalida");
        }
        return new JedisPooled(new HostAndPort(host.trim(), port),
                DefaultJedisClientConfig.builder()
                        .user(username.isEmpty() ? null : username)
                        .password(password.isEmpty() ? null : password)
                        .ssl(tls)
                        .sslParameters(tls ? tlsParameters() : null)
                        .connectionTimeoutMillis(2000).socketTimeoutMillis(2000).build());
    }

    @Bean
    @ConditionalOnProperty(name = "REDIS_TLS", havingValue = "true")
    public JedisClientConfigurationBuilderCustomizer redisTlsHostnameVerification() {
        return builder -> builder.useSsl().sslParameters(tlsParameters());
    }

    private static SSLParameters tlsParameters() {
        var parameters = new SSLParameters();
        parameters.setEndpointIdentificationAlgorithm("HTTPS");
        return parameters;
    }
}
