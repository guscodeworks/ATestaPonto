package br.com.atestaponto.employee.service;

import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization.Context;
import br.com.atestaponto.employee.dto.PublicEmployeeInput;
import br.com.atestaponto.employee.repository.EmployeeEditRepository;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository;
import br.com.atestaponto.publicpunch.service.EmployeeJwt;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmployeeTemporaryPasswordService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final EmployeeCredentialsRepository credentials;
    private final EmployeeEditRepository links;
    private final PublicAdminAuthorization admins;
    private final PublicEmployeeAuthorization authorization;
    private final EmployeeJwt jwt;
    private final EmployeeWelcomeEmail mail;
    private final BCryptPasswordEncoder passwords;
    private final TransactionTemplate transaction;

    public EmployeeTemporaryPasswordService(EmployeeCredentialsRepository credentials, EmployeeEditRepository links, PublicAdminAuthorization admins,
            PublicEmployeeAuthorization authorization, EmployeeJwt jwt, EmployeeWelcomeEmail mail,
            PlatformTransactionManager manager, @Value("${BCRYPT_SALT_ROUNDS:12}") int rounds) {
        this.credentials = credentials;
        this.links = links;
        this.admins = admins;
        this.authorization = authorization;
        this.jwt = jwt;
        this.mail = mail;
        passwords = new BCryptPasswordEncoder(rounds);
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public Map<String, Object> metadata(long id) {
        var current = credentials.findCredential(id);
        if (current == null) return Map.of();
        var result = new LinkedHashMap<String, Object>();
        result.put("primeiro_acesso", current.firstAccess());
        result.put("expira_em", expiry(current));
        if (current.active() && Boolean.TRUE.equals(current.firstAccess())) {
            result.put("versao", jwt.version(id, current.passwordHash()));
        }
        return result;
    }

    public Map<String, Object> reissue(Context previous, long id, JsonNode body) {
        if (body == null || !body.isObject() || body.size() != 2
                || !body.path("confirmacao").isTextual() || !"REEMITIR".equals(body.path("confirmacao").textValue())
                || !body.path("versao_esperada").isTextual()
                || !body.path("versao_esperada").textValue().matches("[a-f0-9]{64}")) {
            throw PublicEmployeeInput.invalid("Confirme REEMITIR e informe a versao esperada da credencial");
        }
        if (previous == null || !"funcionario.editar".equals(previous.capability())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Contexto administrativo invalido");
        }
        String password = randomPassword();
        String hash = passwords.encode(password);
        var committed = transaction.execute(status -> {
            var admin = admins.requireActiveForUpdate(previous.adminId());
            var context = authorization.authorizeInWriteTransaction(admin, "funcionario.editar", id, null);
            var current = credentials.lockCredential(id);
            if (current == null || !current.active() || !Boolean.TRUE.equals(current.firstAccess())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Funcionario indisponivel para reemissao de primeiro acesso");
            }
            var link = links.lockActiveLink(id).orElseThrow(() -> new ResponseStatusException(
                    HttpStatus.CONFLICT, "Funcionario sem vinculo ativo para reemissao"));
            if (context.link() == null || context.link().diretoria_ensino_id() == null
                    || link.id() != context.link().id() || link.unitId() != context.link().unidade_escolar_id()
                    || !links.lockAuthorizedUnit(link.unitId(), context.link().diretoria_ensino_id())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Escopo alterado; consulte o funcionario novamente");
            }
            if (!MessageDigest.isEqual(body.path("versao_esperada").textValue().getBytes(StandardCharsets.US_ASCII),
                    jwt.version(id, current.passwordHash()).getBytes(StandardCharsets.US_ASCII))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Credencial alterada; consulte o funcionario antes de uma nova acao");
            }
            if (credentials.reissueTemporary(id, hash) != 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Credencial alterada; consulte o funcionario novamente");
            }
            var employee = links.lockEmployee(id).orElseThrow(() -> new ResponseStatusException(
                    HttpStatus.CONFLICT, "Funcionario indisponivel para reemissao"));
            return new String[] { employee.nome(), employee.email(), expiry(credentials.lockCredential(id)) };
        });
        LoggerFactory.getLogger(EmployeeTemporaryPasswordService.class).info(
                "audit_evento evento=senha_temporaria_reemitida adminId={} funcionarioId={}", previous.adminId(), id);
        // SMTP ocorre depois do commit; uma falha nunca restaura a credencial revogada.
        return delivery(committed[0], committed[1], password, committed[2]);
    }

    public Map<String, Object> delivery(String name, String email, String password, String expiry) {
        var sent = mail.send(name, email, password);
        var result = new LinkedHashMap<String, Object>();
        result.put("email_acesso", sent);
        if (!"aceito_smtp".equals(sent.get("estado"))) {
            result.put("senha_temporaria", Map.of("senha", password, "expira_em", expiry));
        }
        return result;
    }

    static String randomPassword() {
        byte[] bytes = new byte[18];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String expiry(EmployeeCredentialsRepository.Credential current) {
        return current == null || current.expiresAt() == null ? null
                : current.expiresAt().toInstant(ZoneOffset.UTC).toString();
    }
}
