package br.com.atestaponto.publicpunch.service;

import br.com.atestaponto.employee.service.EmployeeWelcomeEmail;
import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.LongNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Service
public class PublicPasswordRecovery {
    private final EmployeeAccessSessions sessions;
    private final EmployeeCredentialsService credentials;
    private final PublicPunchService punches;
    private final EmployeeWelcomeEmail mail;
    private final ObjectMapper json;
    private final String secret;
    private final SecureRandom random = new SecureRandom();
    public PublicPasswordRecovery(EmployeeAccessSessions sessions, EmployeeCredentialsService credentials,
            PublicPunchService punches, EmployeeWelcomeEmail mail, ObjectMapper json, Environment env) {
        this.sessions = sessions; this.credentials = credentials; this.punches = punches; this.mail = mail; this.json = json;
        secret = env.getRequiredProperty("SESSION_SECRET").strip();
    }
    public record Requested(Object data, Runnable deliver) {}
    public Requested request(JsonNode body, HttpServletRequest request, HttpServletResponse response) {
        String cpf = PublicPunchValidation.recoveryCpf(body);
        var employee = PublicPunchService.credential(() -> credentials.recovery(new EmployeeCredentialsRequest.Recovery(TextNode.valueOf(cpf)))).employee();
        if (employee != null && (!PublicPunchService.safeId(employee.id()) || employee.nome() == null || employee.email() == null || employee.email().isEmpty()))
            throw PublicPunchService.credentialsUnavailable();
        String code = Integer.toString(100000 + random.nextInt(900000));
        byte[] authorization = new byte[32]; random.nextBytes(authorization);
        ObjectNode recovery = json.createObjectNode();
        recovery.put("authorizationId", HexFormat.of().formatHex(authorization));
        try {
            recovery.put("rateLimitSubject", HexFormat.of().formatHex(EmployeeJwt.mac(secret.getBytes(StandardCharsets.UTF_8),
                    json.writeValueAsBytes(java.util.List.of("rate-limit-v1", "cpf:" + cpf)), "HmacSHA256")));
        } catch (java.io.IOException e) { throw new IllegalStateException(e); }
        if (employee == null) recovery.putNull("employeeId"); else recovery.put("employeeId", employee.id());
        recovery.put("codeHash", hash(code)).put("expiresAt", System.currentTimeMillis() + 900000).put("attempts", 0).put("verified", false);
        sessions.createRecovery(request, response, recovery);
        // Envio e auditoria sao agendados pelo controller depois de persistir a sessao e completar a resposta.
        String auditIp = PublicPunchService.auditIp(request);
        return new Requested(Map.of("message", "Se houver uma conta ativa com este CPF, enviaremos um código para o e-mail cadastrado."), () -> {
            if (employee != null) mail.sendRecovery(employee.nome(), employee.email(), code);
            PublicPunchService.audit("recuperacao_senha_solicitada", employee == null ? 0 : employee.id(), auditIp, Map.of(), "Solicitação de recuperação de senha recebida");
        });
    }
    public String sensitiveSubject(HttpServletRequest request) {
        try { return "recovery:" + sessions.recovery(request).data().path("passwordRecovery").path("rateLimitSubject").asText(); }
        catch (PublicPunchException invalid) { return "session:" + PublicPunchRateLimit.ip(request); }
    }
    public Object verify(JsonNode body, HttpServletRequest request) {
        String code = PublicPunchValidation.code(body);
        // CAS evita perder tentativas concorrentes ou ressuscitar uma autorizacao consumida.
        for (int i = 0; i < 10; i++) {
            var snapshot = sessions.recovery(request);
            ObjectNode recovery = (ObjectNode) snapshot.data().get("passwordRecovery");
            int attempts = recovery.path("attempts").isIntegralNumber() ? recovery.path("attempts").asInt(5) : 5;
            boolean valid = attempts >= 0 && attempts < 5 && MessageDigest.isEqual(hash(code).getBytes(StandardCharsets.US_ASCII),
                    recovery.path("codeHash").asText().getBytes(StandardCharsets.US_ASCII))
                    && recovery.path("employeeId").isIntegralNumber() && recovery.path("employeeId").asLong() > 0 && recovery.path("employeeId").asLong() <= 9007199254740991L;
            if (valid) recovery.put("verified", true);
            else if (attempts + 1 >= 5) snapshot.data().remove("passwordRecovery");
            else recovery.put("attempts", attempts + 1);
            if (!sessions.replace(snapshot)) continue;
            if (!valid) throw EmployeeJwt.denied("Código inválido ou expirado.");
            return Map.of("message", "Código confirmado.");
        }
        throw EmployeeJwt.denied("Código inválido ou expirado.");
    }
    public Object reset(JsonNode body, HttpServletRequest request) {
        PublicPunchValidation.password(body, "novaSenha");
        var snapshot = sessions.recovery(request);
        JsonNode recovery = snapshot.data().get("passwordRecovery");
        long id = recovery.path("employeeId").asLong(0);
        if (!recovery.path("verified").isBoolean() || !recovery.path("verified").booleanValue()
                || !recovery.path("employeeId").isIntegralNumber() || id <= 0 || id > 9007199254740991L)
            throw EmployeeJwt.denied("Confirme o código antes de redefinir a senha.");
        snapshot.data().remove("passwordRecovery");
        if (!sessions.replace(snapshot)) throw EmployeeJwt.denied("Código inválido ou expirado.");
        if (!PublicPunchService.credential(() -> credentials.resetPassword(new EmployeeCredentialsRequest.Change(LongNode.valueOf(id), TextNode.valueOf(punches.hash(PublicPunchValidation.text(body, "novaSenha")))))).updated())
            throw PublicPunchService.credentialsUnavailable();
        PublicPunchService.audit("senha_funcionario_redefinida", id, request, Map.of());
        return Map.of("message", "Senha atualizada com sucesso.");
    }
    private String hash(String code) { return HexFormat.of().formatHex(EmployeeJwt.sha256((code + ":" + secret).getBytes(StandardCharsets.UTF_8))); }
}
