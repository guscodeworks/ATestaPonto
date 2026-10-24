package br.com.atestaponto.employee.service;

import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization.Context;
import br.com.atestaponto.employee.dto.*;
import br.com.atestaponto.school.dto.SchoolRegistrationRequest;
import br.com.atestaponto.school.service.SchoolService;
import br.com.atestaponto.service.EmployeeService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Validator;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicEmployeeService {
    private static final Logger LOG = LoggerFactory.getLogger(PublicEmployeeService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private final EmployeeService reads;
    private final SchoolService schools;
    private final EmployeeCreateService creates;
    private final EmployeeEditService edits;
    private final EmployeeActivationService activations;
    private final PublicAdminAuthorization admins;
    private final PublicEmployeeAuthorization authorization;
    private final EmployeeWelcomeEmail mail;
    private final Validator validator;
    private final ObjectMapper json;
    private final BCryptPasswordEncoder passwords;

    public PublicEmployeeService(EmployeeService reads, SchoolService schools, EmployeeCreateService creates,
            EmployeeEditService edits, EmployeeActivationService activations, PublicAdminAuthorization admins,
            PublicEmployeeAuthorization authorization, EmployeeWelcomeEmail mail, Validator validator,
            ObjectMapper json, @Value("${BCRYPT_SALT_ROUNDS:12}") int rounds) {
        this.reads = reads;
        this.schools = schools;
        this.creates = creates;
        this.edits = edits;
        this.activations = activations;
        this.admins = admins;
        this.authorization = authorization;
        this.mail = mail;
        this.validator = validator;
        this.json = json;
        this.passwords = new BCryptPasswordEncoder(rounds);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> list(Context previous, MultiValueMap<String, String> query) {
        Context context = refresh(previous, "funcionario.listar", null, null, false);
        long page = integer(single(query, "page", "1"), 9007199254740991L, "page");
        int limit = (int) integer(single(query, "limit", "20"), 100, "limit");
        String active = single(query, "ativo", null);
        if (active != null && !java.util.Set.of("true", "false", "1", "0").contains(active)) {
            throw PublicEmployeeInput.invalid("ativo", "query", "ativo invalido");
        }
        String cargo = single(query, "cargo", null);
        if (cargo != null) {
            cargo = cargo.strip().toUpperCase(Locale.ROOT);
            if (!java.util.Set.of("FUNCIONARIO", "INSPETOR", "PROFESSOR").contains(cargo)) {
                throw PublicEmployeeInput.invalid("cargo", "query", "cargo invalido");
            }
        }
        String q = single(query, "q", "").strip();
        if (q.codePointCount(0, q.length()) > 120) {
            throw PublicEmployeeInput.invalid("q", "query", "q deve ter no maximo 120 caracteres");
        }
        var request = new EmployeeListRequest(false, context.schoolIds(),
                active == null ? null : active.equals("true") || active.equals("1"), cargo,
                PublicEmployeeInput.escape(q), page, limit);
        var result = reads.list(request);
        return Map.of("items", result.items().stream().map(item -> project(item, true)).toList(),
                "pagination", result.pagination());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> find(Context previous, long id) {
        var context = refresh(previous, "funcionario.visualizar", id, null, false);
        var employee = reads.findAdminEmployeeById(new EmployeeDetailRequest(id, context.link().id()));
        return Map.of("funcionario", project(employee, false));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> registrationUnits(Context previous) {
        var context = refresh(previous, "funcionario.criar", null, null, false);
        return Map.of("items", schools.listForRegistration(new SchoolRegistrationRequest(false, context.schoolIds())));
    }

    public Map<String, Object> create(Context previous, JsonNode body) {
        var request = PublicEmployeeInput.create(body, "pending");
        validate(request);
        try {
            creates.validate(request);
        } catch (ResponseStatusException invalid) {
            if (invalid.getStatusCode().value() == 400) throw PublicEmployeeInput.invalid(invalid.getReason());
            throw invalid;
        }
        var context = refresh(previous, "funcionario.criar", null, request.unidadeEscolarId(), false);
        byte[] bytes = new byte[18];
        RANDOM.nextBytes(bytes);
        String password = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        request = PublicEmployeeInput.create(body, passwords.encode(password));
        long schoolId = request.unidadeEscolarId();
        var result = creates.createAuthorized(request,
                () -> refresh(previous, "funcionario.criar", null, schoolId, true).targetDepartmentId());
        audit("funcionario_cadastrado", context.adminId(), result.id());
        // O service de dominio encerra a transacao antes do envio de e-mail.
        return Map.of("funcionario", project(result, true),
                "email_acesso", mail.send(result.nome(), result.email(), password));
    }

    @Transactional
    public Map<String, Object> edit(Context previous, long id, JsonNode body) {
        var fields = PublicEmployeeInput.edit(body);
        for (var field : fields.entrySet()) {
            if (field.getKey().equals("nome") || field.getKey().equals("telefone")) continue;
            String property = switch (field.getKey()) {
                case "saida_almoco" -> "saidaAlmoco";
                case "retorno_almoco" -> "retornoAlmoco";
                default -> field.getKey();
            };
            if (!validator.validateValue(EmployeeCreateRequest.class, property, field.getValue().textValue()).isEmpty()) {
                throw PublicEmployeeInput.invalid(field.getKey(), "body", field.getKey() + " invalido");
            }
        }
        var context = refresh(previous, "funcionario.editar", id, null, true);
        var link = context.link();
        var result = edits.update(id, new EmployeeEditRequest(link.id(), link.unidade_escolar_id(),
                link.diretoria_ensino_id(), fields));
        audit("funcionario_alterado", context.adminId(), id);
        var employee = project(result, false);
        employee.remove("cargo_id");
        return Map.of("funcionario", employee);
    }

    @Transactional
    public EmployeeActivationResponse activation(Context previous, long id, boolean active, JsonNode body) {
        String confirmation = PublicEmployeeInput.confirmation(body);
        if (!(active ? "REATIVAR" : "DESATIVAR").equals(confirmation)) {
            throw PublicEmployeeInput.invalid("confirmacao deve ser " + (active ? "REATIVAR" : "DESATIVAR"));
        }
        var context = refresh(previous, "funcionario." + (active ? "reativar" : "desativar"), id, null, true);
        var link = context.link();
        var result = activations.changeActivation(id, active, new EmployeeActivationRequest(confirmation,
                link.id(), link.unidade_escolar_id(), link.diretoria_ensino_id()));
        audit(active ? "funcionario_ativado" : "funcionario_desativado", context.adminId(), id);
        return result;
    }

    private Context refresh(Context previous, String capability, Long id, Long schoolId, boolean forUpdate) {
        if (previous == null || !previous.capability().equals(capability)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Contexto administrativo invalido");
        }
        // Escritas travam identidade e acessos ate o commit; o service de dominio revalida vinculo e unidade sob lock.
        var admin = forUpdate ? admins.requireActiveForUpdate(previous.adminId()) : admins.requireActive(previous.adminId());
        return authorization.authorize(admin, capability, id, schoolId);
    }

    private void validate(Object input) {
        if (!validator.validate(input).isEmpty()) throw PublicEmployeeInput.invalid("Dados de requisicao invalidos");
    }

    private ObjectNode project(Object value, boolean mask) {
        ObjectNode result = json.valueToTree(value);
        String cpf = result.path("cpf").asText("").replaceAll("[^0-9]", "");
        result.put("cpf", cpf.length() != 11 ? (mask ? "***.***.***-**" : "") : mask
                ? "***.***.***-" + cpf.substring(9)
                : cpf.substring(0, 3) + "." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-" + cpf.substring(9));
        for (String field : java.util.List.of("telefone", "cargo", "entrada", "saida_almoco", "retorno_almoco", "saida")) {
            if (result.has(field) && result.path(field).asText().isEmpty()) result.putNull(field);
        }
        return result;
    }

    private static String single(MultiValueMap<String, String> query, String field, String fallback) {
        var values = query.get(field);
        if (values == null) return fallback;
        if (values.size() != 1) throw PublicEmployeeInput.invalid(field, "query", field + " invalido");
        return values.getFirst();
    }

    private static long integer(String value, long max, String field) {
        try {
            if (!value.matches("\\+?[0-9]+")) throw new NumberFormatException();
            long number = Long.parseLong(value);
            if (number < 1 || number > max) throw new NumberFormatException();
            return number;
        } catch (NumberFormatException invalid) { throw PublicEmployeeInput.invalid(field, "query", field + " invalido"); }
    }

    private static void audit(String event, long adminId, long employeeId) {
        LOG.info("audit_evento evento={} adminId={} funcionarioId={}", event, adminId, employeeId);
    }
}
