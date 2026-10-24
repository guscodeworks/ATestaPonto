package br.com.atestaponto.publicpunch.controller;

import br.com.atestaponto.publicpunch.service.LoginFailureDelay;
import br.com.atestaponto.publicpunch.service.PublicPasswordRecovery;
import br.com.atestaponto.publicpunch.service.PublicPunchRateLimit;
import br.com.atestaponto.publicpunch.service.PublicPunchService;
import br.com.atestaponto.publicpunch.service.PublicPunchValidation;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.TextNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.DeferredResult;

@RestController
public class PublicPunchController {
    private final PublicPunchService punches;
    private final PublicPasswordRecovery recovery;
    private final PublicPunchRateLimit limits;
    private final org.springframework.core.task.AsyncTaskExecutor executor;
    private final LoginFailureDelay failureDelay;
    public PublicPunchController(PublicPunchService punches, PublicPasswordRecovery recovery, PublicPunchRateLimit limits,
            org.springframework.core.task.AsyncTaskExecutor executor, LoginFailureDelay failureDelay) {
        this.punches = punches; this.recovery = recovery; this.limits = limits; this.executor = executor; this.failureDelay = failureDelay;
    }
    @PostMapping({"/api/pontos/login", "/api/pontos/login/"})
    public DeferredResult<Object> login(@RequestAttribute("publicPunchBody") JsonNode body, HttpServletRequest req, HttpServletResponse res) {
        String subject = PublicPunchValidation.subject(body);
        var reservation = limits.login(subject, req, res);
        var result = new DeferredResult<Object>();
        boolean success = false;
        try {
            result.setResult(ok(punches.login(body, req, res)));
            success = true;
        } catch (PublicPunchService.InvalidLogin invalid) {
            failureDelay.fail(result, invalid);
        } finally { limits.loginFinished(subject, reservation, success, req); }
        return result;
    }
    @PostMapping({"/api/pontos/registrar", "/api/pontos/registrar/", "/api/pontos/bater", "/api/pontos/bater/", "/ponto/bater", "/ponto/bater/"})
    public ResponseEntity<?> register(@RequestAttribute("publicPunchBody") JsonNode body, HttpServletRequest req, HttpServletResponse res) {
        long id = punches.authenticate(req);
        limits.point(id, res);
        return ResponseEntity.status(201).body(ok(punches.register(id, body, req)));
    }
    @GetMapping({"/api/pontos/hoje", "/api/pontos/hoje/"})
    public Object today(HttpServletRequest req) { return ok(punches.today(punches.authenticate(req))); }
    @GetMapping({"/api/pontos/historico", "/api/pontos/historico/"})
    public Object history(HttpServletRequest req) {
        long id = punches.authenticate(req);
        String[] months = req.getParameterValues("mes");
        JsonNode month = months == null ? null : months.length == 1 ? TextNode.valueOf(months[0]) : com.fasterxml.jackson.databind.node.NullNode.instance;
        return ok(punches.history(id, month));
    }
    @PostMapping({"/api/pontos/primeiro-acesso/trocar-senha", "/api/pontos/primeiro-acesso/trocar-senha/"})
    public Object first(@RequestAttribute("publicPunchBody") JsonNode body, HttpServletRequest req, HttpServletResponse res) {
        limits.sensitive("session:" + PublicPunchRateLimit.ip(req), "/primeiro-acesso/trocar-senha", res);
        return ok(punches.firstAccess(body, req));
    }
    @PostMapping({"/api/pontos/recuperar-senha/solicitar", "/api/pontos/recuperar-senha/solicitar/"})
    public DeferredResult<ResponseEntity<?>> request(@RequestAttribute("publicPunchBody") JsonNode body, HttpServletRequest req, HttpServletResponse res) {
        long started = System.nanoTime();
        limits.recovery(PublicPunchValidation.subject(body), res);
        var requested = recovery.request(body, req, res);
        var result = new DeferredResult<ResponseEntity<?>>();
        result.onCompletion(() -> executor.execute(requested.deliver()));
        executor.execute(() -> {
            try {
                long remaining = 300 - (System.nanoTime() - started) / 1000000;
                if (remaining > 0) Thread.sleep(remaining);
                result.setResult(ResponseEntity.status(202).body(ok(requested.data())));
            } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); result.setErrorResult(interrupted); }
        });
        return result;
    }
    @PostMapping({"/api/pontos/recuperar-senha/validar", "/api/pontos/recuperar-senha/validar/"})
    public Object verify(@RequestAttribute("publicPunchBody") JsonNode body, HttpServletRequest req, HttpServletResponse res) {
        limits.sensitive(recovery.sensitiveSubject(req), "/recuperar-senha/validar", res);
        return ok(recovery.verify(body, req));
    }
    @PostMapping({"/api/pontos/recuperar-senha/redefinir", "/api/pontos/recuperar-senha/redefinir/"})
    public Object reset(@RequestAttribute("publicPunchBody") JsonNode body, HttpServletRequest req, HttpServletResponse res) {
        limits.sensitive(recovery.sensitiveSubject(req), "/recuperar-senha/redefinir", res);
        return ok(recovery.reset(body, req));
    }
    private static Object ok(Object data) { return Map.of("success", true, "data", data); }
}
