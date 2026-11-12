package br.com.atestaponto.auth.admin.config;

import jakarta.servlet.DispatcherType;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.config.SessionRepositoryCustomizer;
import org.springframework.session.data.redis.RedisSessionRepository;
import org.springframework.session.data.redis.config.annotation.web.http.EnableRedisHttpSession;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.session.web.http.SessionRepositoryFilter;

@Configuration(proxyBeanMethods = false)
@EnableRedisHttpSession(redisNamespace = "${admin.session.redis.namespace}")
public class AdminSessionConfiguration {
    @Bean
    public SessionRepositoryCustomizer<RedisSessionRepository> adminSessionRepositoryCustomizer(
            @Value("${admin.session.ttl-seconds}") int ttlSeconds,
            @Value("${admin.session.redis.namespace}") String namespace,
            @Value("${spring.data.redis.host}") String host) {
        if (ttlSeconds < 1 || host.isBlank() || namespace.length() > 160
                || !namespace.matches("[A-Za-z0-9][A-Za-z0-9_-]*(?::[A-Za-z0-9][A-Za-z0-9_-]*)*")) {
            throw new IllegalArgumentException("Configuracao Redis da sessao administrativa invalida");
        }
        return repository -> repository.setDefaultMaxInactiveInterval(Duration.ofSeconds(ttlSeconds));
    }

    @Bean
    public CookieSerializer cookieSerializer(
            @Value("${admin.session.ttl-seconds}") int ttlSeconds,
            @Value("${admin.session.secure}") boolean secure) {
        var cookie = new DefaultCookieSerializer();
        cookie.setCookieName("ATESTA_ADMIN_SESSION");
        cookie.setCookiePath("/");
        cookie.setUseHttpOnlyCookie(true);
        cookie.setUseSecureCookie(secure);
        cookie.setSameSite("Lax");
        cookie.setCookieMaxAge(ttlSeconds);
        return cookie;
    }

    @Bean
    public FilterRegistrationBean<SessionRepositoryFilter<?>> adminSessionFilterRegistration(
            SessionRepositoryFilter<?> filter) {
        var registration = new FilterRegistrationBean<SessionRepositoryFilter<?>>(filter);
        // Nao ler cookies administrativos nem acessar Redis nas rotas internas ou de ponto.
        registration.addUrlPatterns("/auth/govbr/*", "/admin/*", "/api/admin/*");
        registration.setDispatcherTypes(DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR);
        registration.setOrder(SessionRepositoryFilter.DEFAULT_ORDER);
        return registration;
    }
}
