package br.com.atestaponto.employee.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Adaptacao do contrato publico; regras de dominio permanecem nos services existentes. */
public final class PublicEmployeeInput {
    private static final Set<String> EDITABLE = Set.of("nome", "email", "telefone", "cargo",
            "entrada", "saida_almoco", "retorno_almoco", "saida");
    private PublicEmployeeInput() {}

    public static EmployeeCreateRequest create(JsonNode body, String passwordHash) {
        object(body);
        if (body.has("cargo_id")) throw invalid("cargo_id nao e aceito no cadastro de funcionario");
        String name = text(body, "nome").strip();
        if (name.length() < 3 || name.length() > 55 || name.contains("<") || name.contains(">")) {
            throw invalid("Nome deve ter entre 3 e 55 caracteres, sem < ou >");
        }
        return new EmployeeCreateRequest(escape(name), text(body, "cpf").replaceAll("[^0-9]", ""),
                email(text(body, "email")), phone(body.get("telefone")), active(body.get("ativo")),
                schoolId(body.get("unidade_escolar_id")), text(body, "cargo").strip().toUpperCase(Locale.ROOT),
                text(body, "entrada").strip(), text(body, "saida_almoco").strip(),
                text(body, "retorno_almoco").strip(), text(body, "saida").strip(), passwordHash);
    }

    public static Map<String, JsonNode> edit(JsonNode body) {
        object(body);
        var fields = new LinkedHashMap<String, JsonNode>();
        body.properties().forEach(entry -> {
            String key = entry.getKey();
            if (!EDITABLE.contains(key)) throw invalid("A requisicao contem campos nao permitidos");
            if (key.equals("telefone")) {
                if (!entry.getValue().isNull() && !entry.getValue().asText().isEmpty()
                        && entry.getValue().asText().replaceAll("[^0-9]", "").isEmpty()) {
                    throw invalid("Telefone deve ter 10 ou 11 digitos");
                }
                String phone = phone(entry.getValue());
                fields.put(key, phone == null ? com.fasterxml.jackson.databind.node.NullNode.instance : new TextNode(phone));
                return;
            }
            String value = text(body, key).strip();
            if (key.equals("nome")) {
                if (value.length() < 3 || value.length() > 150 || value.contains("<") || value.contains(">")) {
                    throw invalid("Nome deve ter entre 3 e 150 caracteres, sem < ou >");
                }
                value = escape(value);
            } else if (key.equals("email")) value = email(value);
            else if (key.equals("cargo")) value = value.toUpperCase(Locale.ROOT);
            fields.put(key, new TextNode(value));
        });
        if (fields.isEmpty()) throw invalid("Informe ao menos um campo para atualizacao");
        return fields;
    }

    public static String confirmation(JsonNode body) {
        object(body);
        if (body.size() != 1 || !body.has("confirmacao")) throw invalid("Envie somente o campo confirmacao");
        return text(body, "confirmacao");
    }

    public static long schoolId(JsonNode value) {
        if (value == null || !(value.isIntegralNumber() || value.isTextual())
                || !value.asText().matches("[0-9]+")) throw invalid("unidade_escolar_id invalido");
        try {
            long id = Long.parseLong(value.asText());
            if (id < 1 || id > 2147483647L) throw invalid("unidade_escolar_id invalido");
            return id;
        } catch (NumberFormatException failure) { throw invalid("unidade_escolar_id invalido"); }
    }

    public static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#x27;").replace("/", "&#x2F;")
                .replace("\\", "&#x5C;").replace("`", "&#96;"); // Mesmo mapeamento do validator.escape do Express.
    }

    private static String email(String value) {
        String email = value.strip().toLowerCase(Locale.ROOT);
        int at = email.lastIndexOf('@');
        if (at < 1) return email; // A validacao existente rejeita o endereco invalido.
        String local = email.substring(0, at), domain = email.substring(at + 1);
        if (Set.of("gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com").contains(domain)) {
            local = local.split("\\+", 2)[0];
        }
        if (domain.equals("googlemail.com")) domain = "gmail.com";
        return local + "@" + domain;
    }

    private static String phone(JsonNode value) {
        if (value == null || value.isNull() || value.asText().isEmpty()) return null;
        String digits = value.asText().replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return null;
        if (!digits.matches("[0-9]{10,11}")) throw invalid("Telefone deve ter 10 ou 11 digitos");
        return digits;
    }

    private static boolean active(JsonNode value) {
        if (value == null || !Set.of("true", "false", "1", "0").contains(value.asText())) {
            throw invalid("ativo deve ser booleano");
        }
        return value.asText().equals("true") || value.asText().equals("1");
    }

    private static String text(JsonNode body, String field) {
        JsonNode value = body.get(field);
        if (value == null || !value.isTextual()) throw invalid(field + " deve ser texto");
        return value.textValue();
    }

    private static void object(JsonNode body) {
        if (body == null || !body.isObject()) throw invalid("Corpo da requisicao invalido");
    }

    public static ResponseStatusException invalid(String message) {
        return invalid("", "body", message);
    }

    public static Invalid invalid(String field, String location, String message) {
        return new Invalid(field, location, message);
    }

    public static final class Invalid extends ResponseStatusException {
        private final java.util.List<Map<String, String>> details;

        private Invalid(String field, String location, String message) {
            super(HttpStatus.UNPROCESSABLE_ENTITY, "Dados de requisicao invalidos");
            details = java.util.List.of(Map.of("field", field, "location", location, "message", message));
        }

        public java.util.List<Map<String, String>> details() { return details; }
    }
}
