import br.com.atestaponto.auth.admin.config.AdminSessionConfiguration;
import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import br.com.atestaponto.schoolqr.config.SchoolQrRedisConfiguration;
import br.com.atestaponto.schoolqr.repository.SchoolQrRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.support.ResourcePropertySource;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.session.data.redis.RedisSessionRepository;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import redis.clients.jedis.JedisPooled;
import redis.clients.jedis.exceptions.JedisException;

/** Checks only Redis beans: no application startup, HTTP, MySQL or dotenv. */
public class RedisSecureCheck {
    public static void main(String[] args) throws Exception {
        if (System.getenv("CHECK_TRUSTSTORE") != null) {
            System.setProperty("javax.net.ssl.trustStore", System.getenv("CHECK_TRUSTSTORE"));
            System.setProperty("javax.net.ssl.trustStorePassword", System.getenv("CHECK_STORE_PASSWORD"));
        }
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addLast(
                    new ResourcePropertySource("classpath:application.properties"));
            context.registerBean(ObjectMapper.class);
            context.register(RedisAutoConfiguration.class, AdminSessionConfiguration.class,
                    SchoolQrRedisConfiguration.class, SchoolQrRepository.class, PublicAdminRateLimit.class);
            context.refresh();
            @SuppressWarnings("unchecked")
            var sessions = (SessionRepository<Session>) (SessionRepository<?>) context.getBean(RedisSessionRepository.class);
            var qr = context.getBean(SchoolQrRepository.class);
            var rates = context.getBean(PublicAdminRateLimit.class);
            var client = context.getBean(JedisPooled.class);
            String namespace = System.getenv("REDIS_NAMESPACE");
            if (args[0].equals("unavailable")) {
                mustFail(() -> sessions.findById("missing"));
                var deniedSession = sessions.createSession();
                deniedSession.setAttribute("fixture", "denied");
                mustFail(() -> sessions.save(deniedSession));
                mustFail(() -> qr.get(namespace + ":ponto:qr:unit:check"));
                mustFail(() -> qr.regenerate(namespace + ":ponto:qr:unit:check",
                        namespace + ":ponto:qr:token:check", "{\"tokenHash\":\"check\"}",
                        "check", namespace + ":ponto:qr:token:"));
                mustFail(() -> rates.increment("check", "fixture"));
                mustFail(() -> rates.current("check", "fixture"));
            } else {
                var session = sessions.createSession();
                session.setAttribute("fixture", "check");
                sessions.save(session);
                require("check".equals(sessions.findById(session.getId()).getAttribute("fixture")));
                String adminKey = namespace + ":admin:spring-session:sessions:" + session.getId();
                require(client.exists(adminKey) && client.ttl(adminKey) > 0);
                String unitKey = namespace + ":ponto:qr:unit:check";
                String tokenPrefix = namespace + ":ponto:qr:token:";
                qr.regenerate(unitKey, tokenPrefix + "check", "{\"tokenHash\":\"check\"}", "check", tokenPrefix);
                require("check".equals(qr.get(tokenPrefix + "check")));
                qr.regenerate(unitKey, tokenPrefix + "next", "{\"tokenHash\":\"next\"}", "check", tokenPrefix);
                require(qr.get(tokenPrefix + "check") == null);
                var reservation = rates.increment("check", "fixture");
                require(reservation.hits() == 1 && reservation.ttl() > 0);
                require(rates.current("check", "fixture").hits() == 1);
                rates.refund("check", "fixture", reservation);
                require(rates.current("check", "fixture").hits() == 0);
                require(!client.keys(namespace + ":ponto:rate_limit:check:*").isEmpty());
                sessions.deleteById(session.getId());
                require(sessions.findById(session.getId()) == null);
                client.del(unitKey, tokenPrefix + "next");
            }
        } catch (Throwable error) {
            // Connection errors may contain endpoints; report only the type, never credentials.
            System.err.println("FAIL Redis check: " + error.getClass().getSimpleName());
            Throwable cause = error;
            while (cause.getCause() != null) cause = cause.getCause();
            System.err.println("FAIL Redis check: cause " + cause.getClass().getSimpleName());
            System.exit(1);
        }
        System.out.println("PASS " + args[0] + ": admin sessions, school QR, rate limiting");
    }

    private static void require(boolean condition) {
        if (!condition) throw new AssertionError("Redis invariant failed");
    }

    private static void mustFail(Runnable operation) {
        try {
            operation.run();
        } catch (RedisConnectionFailureException | JedisException expected) {
            return;
        }
        throw new AssertionError("Redis failure accepted or local fallback used");
    }
}
