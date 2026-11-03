package br.com.atestaponto.adminaccess.dto;

import br.com.atestaponto.employee.dto.PublicEmployeeInput;
import br.com.atestaponto.auth.admin.service.AdminAccessPolicy;
import br.com.atestaponto.validation.Cpf;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Validator;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.util.MultiValueMap;

public final class PublicAccessInput {
    private static final long MAX_ID = 9007199254740991L;
    // Dominios do normalizeEmail do Express, com gmail_remove_dots=false.
    private static final Set<String> OUTLOOK = Set.of((
            "hotmail.at hotmail.be hotmail.ca hotmail.cl hotmail.co.il hotmail.co.nz hotmail.co.th hotmail.co.uk hotmail.com hotmail.com.ar hotmail.com.au hotmail.com.br " +
            "hotmail.com.gr hotmail.com.mx hotmail.com.pe hotmail.com.tr hotmail.com.vn hotmail.cz hotmail.de hotmail.dk hotmail.es hotmail.fr hotmail.hu hotmail.id " +
            "hotmail.ie hotmail.in hotmail.it hotmail.jp hotmail.kr hotmail.lv hotmail.my hotmail.ph hotmail.pt hotmail.sa hotmail.sg hotmail.sk " +
            "live.be live.co.uk live.com live.com.ar live.com.mx live.de live.es live.eu live.fr live.it live.nl msn.com " +
            "outlook.at outlook.be outlook.cl outlook.co.il outlook.co.nz outlook.co.th outlook.com outlook.com.ar outlook.com.au outlook.com.br outlook.com.gr outlook.com.pe " +
            "outlook.com.tr outlook.com.vn outlook.cz outlook.de outlook.dk outlook.es outlook.fr outlook.hu outlook.id outlook.ie outlook.in outlook.it " +
            "outlook.jp outlook.kr outlook.lv outlook.my outlook.ph outlook.pt outlook.sa outlook.sg outlook.sk passport.com").split(" "));
    private static final Set<String> YAHOO = Set.of("rocketmail.com", "yahoo.ca", "yahoo.co.uk", "yahoo.com", "yahoo.de", "yahoo.fr", "yahoo.in", "yahoo.it", "ymail.com");
    private static final Set<String> YANDEX = Set.of("yandex.ru", "yandex.ua", "yandex.kz", "yandex.com", "yandex.by", "ya.ru");
    private PublicAccessInput() {}
    public record Grant(String cpf, String nome, String email, String perfil, Long diretoriaId, Long unidadeId,
            String status, LocalDate inicio, LocalDate fim) {
        public AdminAccessRequest.Grant authorized(long adminId, long accessId) {
            return new AdminAccessRequest.Grant(adminId, accessId, cpf, nome, email, perfil, diretoriaId, unidadeId, status, inicio, fim);
        }
    }
    public record Pagination(long page, long limit) {}

    public static long id(String raw) {
        var errors = new ArrayList<Map<String, String>>();
        Long id = integer(raw, MAX_ID);
        if (id == null) add(errors, "id", "params", "ID de acesso invalido");
        check(errors);
        return id;
    }

    public static Pagination pagination(MultiValueMap<String, String> query) {
        var errors = new ArrayList<Map<String, String>>();
        Long page = integer(single(query, "page", "1"), MAX_ID);
        Long limit = integer(single(query, "limit", "20"), 100);
        if (page == null) add(errors, "page", "query", "page deve ser >= 1");
        if (limit == null) add(errors, "limit", "query", "limit deve ser entre 1 e 100");
        String active = single(query, "ativo", null);
        if (active != null && !List.of("true", "false", "1", "0").contains(active)) add(errors, "ativo", "query", "ativo invalido");
        String cargo = single(query, "cargo", null);
        if (cargo != null && !List.of("FUNCIONARIO", "INSPETOR", "PROFESSOR").contains(normalize(cargo))) add(errors, "cargo", "query", "cargo invalido");
        String q = single(query, "q", "").strip();
        if (q.codePointCount(0, q.length()) > 120) add(errors, "q", "query", "q deve ter no maximo 120 caracteres");
        check(errors);
        return new Pagination(page, limit);
    }

    private static String single(MultiValueMap<String, String> query, String key, String fallback) {
        var values = query.get(key);
        return values == null ? fallback : values.size() == 1 ? values.getFirst() : "invalid";
    }

    public static Grant grant(JsonNode body, Validator validator) {
        var errors = new ArrayList<Map<String, String>>();
        if (body == null || !body.isObject()) body = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        String cpf = text(body, "cpf").replaceAll("[^0-9]", "");
        if (cpf.isEmpty()) add(errors, "cpf", "body", "CPF e obrigatorio");
        else if (cpf.length() != 11) add(errors, "cpf", "body", "CPF deve ter 11 digitos");
        else if (!Cpf.valid(cpf)) add(errors, "cpf", "body", "CPF invalido");
        String name = body.has("nome") ? text(body, "nome").strip() : null;
        if (name != null) {
            int length = name.codePointCount(0, name.length());
            if (length < 3 || length > 150) add(errors, "nome", "body", "Nome deve ter entre 3 e 150 caracteres");
            else if (name.contains("<") || name.contains(">")) add(errors, "nome", "body", "Nome contem caracteres invalidos");
            name = PublicEmployeeInput.escape(name);
        }
        String email = body.hasNonNull("email") ? text(body, "email").strip() : null;
        if (email != null) {
            if (email.length() > 150) add(errors, "email", "body", "Email muito longo");
            else if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
                    || !validator.validateValue(AdminAccessRequest.Grant.class, "email", email).isEmpty()) add(errors, "email", "body", "Email invalido");
            email = normalizeEmail(email);
        }
        String profile = normalize(text(body, "perfil"));
        if (profile.isEmpty()) add(errors, "perfil", "body", "perfil e obrigatorio");
        else if (!AdminAccessPolicy.CAPABILITIES.containsKey(profile)) add(errors, "perfil", "body", "perfil invalido");
        Long department = optionalId(body, "diretoria_ensino_id", errors);
        Long school = optionalId(body, "unidade_escolar_id", errors);
        String status = body.has("status") ? normalize(text(body, "status")) : "ATIVO";
        if (!List.of("ATIVO", "SUSPENSO").contains(status)) add(errors, "status", "body", "status invalido");
        LocalDate start = date(body, "data_inicio", errors), end = date(body, "data_fim", errors);
        check(errors);
        return new Grant(cpf, name, email, profile, department, school, status, start, end);
    }

    private static String normalizeEmail(String raw) {
        String email = raw.toLowerCase(Locale.ROOT);
        int at = email.lastIndexOf('@');
        if (at < 0) return email;
        String local = email.substring(0, at), domain = email.substring(at + 1);
        if (List.of("gmail.com", "googlemail.com", "icloud.com", "me.com").contains(domain) || OUTLOOK.contains(domain)) local = local.split("\\+", 2)[0];
        if (YAHOO.contains(domain) && local.contains("-")) local = local.substring(0, local.lastIndexOf('-'));
        if (YANDEX.contains(domain)) domain = "yandex.ru";
        return local + "@" + (domain.equals("googlemail.com") ? "gmail.com" : domain);
    }

    private static Long optionalId(JsonNode body, String field, List<Map<String, String>> errors) {
        if (!body.has(field)) return null;
        Long id = integer(text(body, field), MAX_ID);
        if (id == null) add(errors, field, "body", field + " invalido");
        return id;
    }

    private static Long integer(String raw, long max) {
        try {
            if (raw == null || !raw.matches("\\+?[0-9]+")) return null;
            long value = Long.parseLong(raw);
            return value >= 1 && value <= max ? value : null;
        } catch (NumberFormatException error) { return null; }
    }

    private static LocalDate date(JsonNode body, String field, List<Map<String, String>> errors) {
        if (!body.has(field)) return null;
        String value = text(body, field);
        try {
            if (value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return LocalDate.parse(value);
            // Express toDate() converte timestamps com offset para UTC antes de recortar a data.
            String iso = value.replace(' ', 'T').replaceFirst("([+-][0-9]{2})([0-9]{2})$", "$1:$2");
            try { return OffsetDateTime.parse(iso).withOffsetSameInstant(java.time.ZoneOffset.UTC).toLocalDate(); }
            catch (java.time.format.DateTimeParseException noOffset) {
                return java.time.LocalDateTime.parse(iso).atZone(java.time.ZoneId.systemDefault())
                        .withZoneSameInstant(java.time.ZoneOffset.UTC).toLocalDate();
            }
        } catch (java.time.DateTimeException invalid) {
            add(errors, field, "body", field + " invalida");
            return null;
        }
    }

    private static String text(JsonNode body, String field) {
        JsonNode value = body.get(field);
        return value != null && value.isValueNode() && !value.isNull() ? value.asText() : "";
    }
    private static String normalize(String value) { return value.strip().toUpperCase(Locale.ROOT); }
    private static void add(List<Map<String, String>> errors, String field, String location, String message) {
        errors.add(Map.of("field", field, "location", location, "message", message));
    }
    private static void check(List<Map<String, String>> errors) { if (!errors.isEmpty()) throw new Invalid(errors); }
    public static final class Invalid extends RuntimeException {
        private final List<Map<String, String>> details;
        private Invalid(List<Map<String, String>> details) { super("Dados de requisicao invalidos"); this.details = List.copyOf(details); }
        public List<Map<String, String>> details() { return details; }
    }
}
