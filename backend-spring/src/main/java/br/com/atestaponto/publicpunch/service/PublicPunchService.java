package br.com.atestaponto.publicpunch.service;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest;
import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse.AuthenticationEmployee;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsService;
import br.com.atestaponto.punch.dto.PunchRequest;
import br.com.atestaponto.punch.service.PunchService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.LongNode;
import com.fasterxml.jackson.databind.node.TextNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.stereotype.Service;

@Service
public class PublicPunchService {
    private final EmployeeCredentialsService credentials;
    private final PunchService punches;
    private final EmployeeJwt jwt;
    private final EmployeeAccessSessions sessions;
    private final ObjectMapper json;
    private final int rounds;
    private final String invalidHash;
    private final long failureDelay;
    public PublicPunchService(EmployeeCredentialsService credentials, PunchService punches, EmployeeJwt jwt,
            EmployeeAccessSessions sessions, ObjectMapper json, Environment env) {
        this.credentials = credentials; this.punches = punches; this.jwt = jwt; this.sessions = sessions; this.json = json;
        rounds = env.getProperty("BCRYPT_SALT_ROUNDS", Integer.class, 12);
        if (rounds < 10 || rounds > 15) throw new IllegalArgumentException("BCRYPT_SALT_ROUNDS invalido");
        invalidHash = hash("invalid-login-credential");
        failureDelay = env.getProperty("LOGIN_FAILURE_DELAY_MS", Long.class, 2000L);
        if (failureDelay < 0 || failureDelay > 10000) throw new IllegalArgumentException("LOGIN_FAILURE_DELAY_MS invalido");
    }
    public Object login(JsonNode body, HttpServletRequest req, HttpServletResponse res) {
        PublicPunchValidation.login(body);
        Long qrUnit = sessions.qrUnit(req, res);
        String login = PublicPunchValidation.identifier(body);
        var employee = checkedEmployee(credential(() -> credentials.login(new EmployeeCredentialsRequest.Login(login.contains("@") ? null : TextNode.valueOf(login),
                login.contains("@") ? TextNode.valueOf(login) : null))).employee());
        if (employee != null && (login.contains("@") ? employee.email() == null || !employee.email().toLowerCase(java.util.Locale.ROOT).equals(login) : !employee.cpf().equals(login)))
            throw credentialsUnavailable();
        boolean matches;
        try { matches = BCrypt.checkpw(passwordBytes(PublicPunchValidation.text(body, "senha")), employee == null || employee.senha_hash() == null ? invalidHash : employee.senha_hash()); }
        catch (IllegalArgumentException invalidCredential) { matches = false; }
        if (employee == null || !matches || !employee.ativo()) invalidLogin(req, 0);
        var link = credential(() -> credentials.activeLink(employeeId(employee.id())));
        if (!link.modern() && link.vinculo() != null || link.vinculo() != null
                && (!safeId(link.vinculo().id()) || !safeId(link.vinculo().unidade_escolar_id()))) throw credentialsUnavailable();
        if (link.modern() && link.vinculo() == null) invalidLogin(req, employee.id());
        if (qrUnit != null) {
            if (!link.modern()) throw new PublicPunchException(403, "FORBIDDEN", "Contexto de QR Code indisponivel");
            if (link.vinculo().unidade_escolar_id() != qrUnit) {
                audit("funcionario_login_qr_unidade_incompativel", employee.id(), req, Map.of());
                throw new PublicPunchException(403, "FORBIDDEN", "QR Code nao corresponde a unidade escolar do funcionario");
            }
        }
        boolean first = Boolean.TRUE.equals(employee.primeiro_acesso());
        String token = jwt.issue(employee.id(), employee.senha_hash(), first);
        if (!first && !credential(() -> credentials.lastLogin(employeeId(employee.id()))).updated() && link.modern()) throw credentialsUnavailable();
        audit(first ? "funcionario_primeiro_acesso_validado" : "funcionario_login_sucesso", employee.id(), req, Map.of("login", "[REDACTED]"));
        var result = new LinkedHashMap<String, Object>();
        result.put("primeiro_acesso", first);
        result.put(first ? "token_primeiro_acesso" : "token", token);
        result.put("expiresIn", jwt.expires(first));
        var identity = new LinkedHashMap<String, Object>();
        identity.put("id", employee.id()); identity.put("nome", employee.nome()); identity.put("email", employee.email());
        String cpf = PublicPunchValidation.digits(employee.cpf() == null ? "" : employee.cpf());
        identity.put("cpf", cpf.length() == 11 ? "***.***.***-" + cpf.substring(9) : "***.***.***-**");
        result.put("funcionario", identity);
        return result;
    }
    private void invalidLogin(HttpServletRequest req, long id) {
        audit("funcionario_login_invalido", id, req, Map.of("login", "[REDACTED]"));
        try { Thread.sleep(failureDelay); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        throw EmployeeJwt.denied("CPF/email ou senha invalidos");
    }
    public long authenticate(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization == null) throw EmployeeJwt.denied("Sessao do funcionario e obrigatoria");
        JsonNode claims = jwt.verify(authorization, false);
        if (!claims.path("role").asText().toLowerCase(java.util.Locale.ROOT).equals("funcionario"))
            throw new PublicPunchException(403, "FORBIDDEN", "Acesso de funcionario obrigatorio");
        long id = jwt.id(claims, false);
        String version = claims.path("credentialVersion").asText();
        if (!version.matches("[a-f0-9]{64}")) throw EmployeeJwt.denied("Sessao invalidada. Faca login novamente.");
        AuthenticationEmployee employee = checkedEmployee(credential(() -> credentials.tokenValidation(employeeId(id))).employee());
        if (employee != null && employee.id() != id) throw credentialsUnavailable();
        if (employee == null || !employee.ativo()) throw EmployeeJwt.denied("Funcionario inexistente ou inativo");
        if (!MessageDigest.isEqual(version.getBytes(StandardCharsets.US_ASCII), jwt.version(id, employee.senha_hash()).getBytes(StandardCharsets.US_ASCII)))
            throw EmployeeJwt.denied("Sessao invalidada. Faca login novamente.");
        if (!Boolean.FALSE.equals(employee.primeiro_acesso()))
            throw new PublicPunchException(403, "FORBIDDEN", "Troca de senha obrigatoria antes de acessar o ponto");
        return id;
    }
    public Object firstAccess(JsonNode body, HttpServletRequest request) {
        PublicPunchValidation.password(body, "novaSenha");
        long id = jwt.id(jwt.verify(request.getHeader("Authorization"), true), true);
        if (!credential(() -> credentials.firstAccess(new EmployeeCredentialsRequest.Change(LongNode.valueOf(id), TextNode.valueOf(hash(PublicPunchValidation.text(body, "novaSenha")))))).updated())
            throw credentialsUnavailable();
        audit("senha_primeiro_acesso_atualizada", id, request, Map.of());
        return Map.of("primeiro_acesso", false, "message", "Senha atualizada com sucesso. Faca login novamente.");
    }
    public Object register(long id, JsonNode body, HttpServletRequest request) {
        PublicPunchValidation.punch(body);
        var reading = json.createArrayNode().add(body.get("latitude")).add(body.get("longitude"));
        if (body.has("accuracy") || body.has("timestamp")) { reading.add(body.get("accuracy")); reading.add(body.get("timestamp")); }
        // Numeros usam a representacao ECMAScript para preservar o hash do replay Express.
        String raw = "[" + java.util.stream.StreamSupport.stream(reading.spliterator(), false)
                .map(PublicPunchService::jsNumber).collect(java.util.stream.Collectors.joining(",")) + "]";
        var result = punches.register(new PunchRequest(LongNode.valueOf(id), PublicPunchValidation.text(body, "chaveIdempotencia"), raw, null, null));
        if (!result.replayed()) audit("batida_ponto_realizada", id, request, Map.of(
                "sequencia", result.response().path("ponto").path("sequencia").asInt(),
                "tipo", result.response().path("ponto").path("tipo").asText(),
                "distancia_metros", result.response().path("ponto").path("distancia_metros").asDouble(),
                "latitude", body.path("latitude").doubleValue(), "longitude", body.path("longitude").doubleValue(),
                "user_agent", safeUserAgent(request.getHeader("User-Agent"))));
        return result.response();
    }
    public Object today(long id) { return punches.today(new PunchRequest(LongNode.valueOf(id), null, null, null, null)); }
    public Object history(long id, JsonNode month) { return punches.history(new PunchRequest(LongNode.valueOf(id), null, null, month, null)); }
    String hash(String password) { return BCrypt.hashpw(passwordBytes(password), BCrypt.gensalt("$2b", rounds)); }
    // node-bcrypt trunca em 72 bytes, inclusive no meio de um caractere UTF-8.
    private static byte[] passwordBytes(String password) {
        byte[] bytes = password.getBytes(StandardCharsets.UTF_8);
        return bytes.length <= 72 ? bytes : java.util.Arrays.copyOf(bytes, 72);
    }
    static String jsNumber(JsonNode node) {
        if (node == null || node.isNull()) return "null";
        double value = node.doubleValue();
        if (!Double.isFinite(value)) return "null";
        if (value == 0) return "0";
        var exact = new java.math.BigDecimal(value);
        java.math.BigDecimal shortest = exact;
        for (int precision = 1; precision <= 17; precision++) {
            shortest = exact.round(new java.math.MathContext(precision, java.math.RoundingMode.HALF_EVEN)).stripTrailingZeros();
            if (Double.parseDouble(shortest.toString()) == value) break;
        }
        if (Math.abs(value) >= 1e-6 && Math.abs(value) < 1e21) return shortest.toPlainString();
        int exponent = shortest.precision() - shortest.scale() - 1;
        return shortest.movePointLeft(exponent).toPlainString() + "e" + (exponent >= 0 ? "+" : "") + exponent;
    }
    static boolean safeId(long id) { return id > 0 && id <= 9007199254740991L; }
    private static AuthenticationEmployee checkedEmployee(AuthenticationEmployee employee) {
        if (employee == null) return null;
        if (!safeId(employee.id()) || employee.cpf() == null || !employee.cpf().matches("[0-9]{11}")
                || employee.nome() == null || employee.nome().isBlank() || !employee.ativo() || employee.primeiro_acesso() == null
                || employee.senha_hash() == null || !employee.senha_hash().matches("\\$2[ab]\\$(0[4-9]|[12][0-9]|3[01])\\$[./A-Za-z0-9]{53}"))
            throw credentialsUnavailable();
        return employee;
    }
    static PublicPunchException credentialsUnavailable() {
        return new PublicPunchException(502, "EMPLOYEE_CREDENTIALS_SERVICE_UNAVAILABLE", "Servico de credenciais indisponivel");
    }
    static <T> T credential(java.util.function.Supplier<T> call) {
        try { return call.get(); }
        catch (br.com.atestaponto.employeecredentials.service.EmployeeCredentialsException e) {
            if (e.status() == 401 || e.status() == 409) throw e;
            throw credentialsUnavailable();
        } catch (RuntimeException unavailable) { throw credentialsUnavailable(); }
    }
    static EmployeeCredentialsRequest.EmployeeId employeeId(long id) { return new EmployeeCredentialsRequest.EmployeeId(LongNode.valueOf(id)); }
    private static String safeUserAgent(String value) {
        if (value == null) return "";
        value = value.substring(0, Math.min(255, value.length())).replaceAll("[\\r\\n]", "");
        if (value.matches("(?is).*(?:[^\\s@]+@[^\\s@]+|https?://|bearer |basic |token|password|senha|cookie|authorization|code|state).*")) return "[REDACTED]";
        return value;
    }
    static void audit(String event, long id, HttpServletRequest request, Map<String, Object> metadata) {
        String message = switch (event) {
            case "funcionario_login_invalido" -> "Tentativa de login de funcionario invalida";
            case "funcionario_login_qr_unidade_incompativel" -> "Tentativa de login com QR Code de outra unidade escolar";
            case "funcionario_primeiro_acesso_validado" -> "Senha temporaria validada; troca de senha obrigatoria";
            case "funcionario_login_sucesso" -> "Login de funcionario realizado com CPF/email e senha";
            case "senha_primeiro_acesso_atualizada" -> "Senha temporaria substituida no primeiro acesso";
            case "batida_ponto_realizada" -> "Batida de ponto registrada com sucesso";
            case "recuperacao_senha_solicitada" -> "Solicitação de recuperação de senha recebida";
            case "senha_funcionario_redefinida" -> "Senha de funcionário redefinida por recuperação de acesso";
            default -> event;
        };
        String ip = auditIp(request);
        audit(event, id, ip, metadata, message);
    }
    static String auditIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        String ip = forwarded == null ? request.getRemoteAddr() : forwarded.split(",", -1)[0].strip();
        return ip == null || ip.length() > 64 || !ip.matches("[0-9a-fA-F:.%]+") ? "[InvalidIP]" : ip;
    }
    static void audit(String event, long id, String ip, Map<String, Object> metadata, String message) {
        var logger = LoggerFactory.getLogger(PublicPunchService.class);
        if (event.equals("funcionario_login_invalido") || event.equals("funcionario_login_qr_unidade_incompativel"))
            logger.warn("audit_evento evento={} nivel=WARN funcionarioId={} mensagem={} ipOrigem={} metadados={}", event, id, message, ip, metadata);
        else logger.info("audit_evento evento={} nivel=INFO funcionarioId={} mensagem={} ipOrigem={} metadados={}", event, id, message, ip, metadata);
    }
}
