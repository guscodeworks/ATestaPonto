package br.com.atestaponto.publicpunch.service;

import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Service
public class PublicPunchRateLimit {
    private final PublicAdminRateLimit limits;
    private final int failures, pointMax;
    private final long pointWindow;
    public PublicPunchRateLimit(PublicAdminRateLimit limits, Environment env) {
        this.limits = limits;
        failures = env.getProperty("LOGIN_RATE_LIMIT_IP_FAILURE_MAX", Integer.class, 100);
        pointMax = env.getProperty("POINT_RATE_LIMIT_MAX", Integer.class, 500);
        pointWindow = env.getProperty("POINT_RATE_LIMIT_WINDOW_MS", Long.class, 300000L);
        if (failures < 5 || failures > 10000 || pointMax < 1 || pointMax > 10000 || pointWindow < 1000 || pointWindow > 3600000)
            throw new IllegalArgumentException("Limites de ponto invalidos");
    }
    public void ip(HttpServletRequest req, HttpServletResponse res) { reserve("ip-abuse", PublicAdminRateLimit.ipSubject(ip(req)), limits.ipLimit(), 900000, res); }
    public PublicAdminRateLimit.Reservation login(String identity, HttpServletRequest req, HttpServletResponse res) {
        try {
            var current = limits.current("login-ip-failure", PublicAdminRateLimit.ipSubject(ip(req)));
            PublicAdminRateLimit.headers("login-ip-failure", current, failures, 900000, res);
            if (current.hits() >= failures) {
                PublicAdminRateLimit.retryAfter(current, res);
                throw limited();
            }
            try { return reserve("login-identity", identity, 5, 900000, res); }
            catch (PublicPunchException blocked) {
                loginFinished(identity, null, false, req);
                throw blocked;
            }
        } catch (PublicPunchException e) { throw e; }
        catch (RuntimeException e) { throw unavailable(); }
    }
    public void loginFinished(String identity, PublicAdminRateLimit.Reservation reservation, boolean success, HttpServletRequest req) {
        try {
            if (success) limits.refund("login-identity", identity, reservation);
            else limits.increment("login-ip-failure", PublicAdminRateLimit.ipSubject(ip(req)));
        } catch (RuntimeException conservative) {
            // Falha no desconto conserva a cota; nunca libera tentativas extras.
            org.slf4j.LoggerFactory.getLogger(getClass()).error("Falha na contabilizacao do limite de login");
        }
    }
    public void recovery(String subject, HttpServletResponse res) { reserve("password-recovery", subject, 5, 900000, res); }
    public void sensitive(String subject, String path, HttpServletResponse res) {
        reserve("sensitive", subject, 40, 900000, res);
        reserve("sensitive-resource", List.of(subject, "recovery", path, ""), 40, 900000, res);
    }
    public void point(long id, HttpServletResponse res) { reserve("point", "employee:" + id, pointMax, pointWindow, res); }
    private PublicAdminRateLimit.Reservation reserve(String name, Object subject, int max, long window, HttpServletResponse res) {
        try {
            var value = limits.reserve(name, subject, max, window, res);
            if (value.hits() > max) throw limited();
            return value;
        } catch (PublicPunchException e) { throw e; }
        catch (RuntimeException e) { throw unavailable(); }
    }
    private PublicPunchException limited() {
        return new PublicPunchException(429, "RATE_LIMITED", "Muitas requisicoes. Tente novamente em instantes");
    }
    private PublicPunchException unavailable() { return new PublicPunchException(503, "RATE_LIMIT_UNAVAILABLE", "Protecao temporariamente indisponivel. Tente novamente em instantes."); }
    // RemoteIpValve (forward-headers-strategy=native) ja resolve X-Forwarded-For apenas de proxies internos.
    public static String ip(HttpServletRequest request) { return request.getRemoteAddr(); }
}
