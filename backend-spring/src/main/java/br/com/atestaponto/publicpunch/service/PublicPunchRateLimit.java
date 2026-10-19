package br.com.atestaponto.publicpunch.service;

import br.com.atestaponto.auth.admin.service.PublicAdminRateLimit;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.InetAddress;
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
    public void ip(HttpServletRequest req, HttpServletResponse res) { reserve("ip-abuse", ipSubject(ip(req)), limits.ipLimit(), 900000, res); }
    public PublicAdminRateLimit.Reservation login(String identity, HttpServletRequest req, HttpServletResponse res) {
        try {
            var current = limits.current("login-ip-failure", ipSubject(ip(req)));
            headers("login-ip-failure", current, failures, 900000, res);
            if (current.hits() >= failures) throw limited(current, res);
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
            else limits.increment("login-ip-failure", ipSubject(ip(req)));
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
            var value = limits.increment(name, subject, window);
            headers(name, value, max, window, res);
            if (value.hits() > max) throw limited(value, res);
            return value;
        } catch (PublicPunchException e) { throw e; }
        catch (RuntimeException e) { throw unavailable(); }
    }
    private void headers(String name, PublicAdminRateLimit.Reservation value, int max, long window, HttpServletResponse res) {
        long seconds = Math.max(1, (Math.max(0, value.ttl()) + 999) / 1000);
        res.addHeader("RateLimit", "\"" + name + "\"; r=" + Math.max(0, max - value.hits()) + "; t=" + seconds);
        res.addHeader("RateLimit-Policy", "\"" + name + "\"; q=" + max + "; w=" + ((window + 999) / 1000));
    }
    private PublicPunchException limited(PublicAdminRateLimit.Reservation value, HttpServletResponse res) {
        res.setHeader("Retry-After", Long.toString(Math.max(1, (value.ttl() + 999) / 1000)));
        return new PublicPunchException(429, "RATE_LIMITED", "Muitas requisicoes. Tente novamente em instantes");
    }
    private PublicPunchException unavailable() { return new PublicPunchException(503, "RATE_LIMIT_UNAVAILABLE", "Protecao temporariamente indisponivel. Tente novamente em instantes."); }
    public static String ip(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        String[] hops = forwarded == null ? new String[0] : forwarded.split(",", -1);
        return hops.length == 0 ? request.getRemoteAddr() : hops[hops.length - 1].strip();
    }
    private static String ipSubject(String ip) {
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

}
