package br.com.atestaponto.publicpunch.service;

import br.com.atestaponto.validation.Cpf;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class PublicPunchValidation {
    private PublicPunchValidation() {}
    static String text(JsonNode body, String field) { return body.path(field).isTextual() ? body.path(field).textValue() : ""; }
    static String digits(String value) { return value.replaceAll("[^0-9]", ""); }
    private static JsonNode candidate(JsonNode body) {
        for (String field : List.of("identificador", "login", "email", "cpf"))
            if (body.hasNonNull(field)) return body.get(field);
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }
    private static String primitiveText(JsonNode value) {
        return value.isTextual() ? value.textValue() : value.isNumber() ? PublicPunchService.jsNumber(value) : value.isBoolean() ? value.asText() : "";
    }
    private static String trim(String value) { return value.replaceAll("^[\\s\\p{Z}\\uFEFF]+|[\\s\\p{Z}\\uFEFF]+$", ""); }
    static String identifier(JsonNode body) {
        String value = trim(primitiveText(candidate(body))).toLowerCase(Locale.ROOT);
        return value.contains("@") ? value : digits(value);
    }
    public static String subject(JsonNode body) {
        if (!candidate(body).isTextual() || candidate(body).textValue().length() > 150) return "invalid";
        String value = identifier(body);
        return value.length() <= 150 && validIdentifier(value) ? (value.contains("@") ? "email:" : "cpf:") + value : "invalid";
    }
    static boolean validIdentifier(String value) { return value.contains("@") ? value.matches("[^\\s\\p{Z}\\uFEFF@]+@[^\\s\\p{Z}\\uFEFF@]+\\.[^\\s\\p{Z}\\uFEFF@]+") : Cpf.valid(value); }
    static void login(JsonNode body) {
        var errors = new ArrayList<Map<String, String>>();
        String value = identifier(body);
        if (value.isEmpty() || value.length() > 150 || !validIdentifier(value)) error(errors, "identificador", value.isEmpty() ? "CPF ou email e obrigatorio" : "CPF ou email invalido");
        password(body, "senha", errors);
        check(errors);
    }
    static void password(JsonNode body, String field) {
        var errors = new ArrayList<Map<String, String>>(); password(body, field, errors); check(errors);
    }
    private static void password(JsonNode body, String field, List<Map<String, String>> errors) {
        if (!body.path(field).isTextual()) error(errors, field, "Senha deve ser texto");
        else {
            String value = text(body, field);
            int count = value.codePointCount(0, value.length());
            if (count < 8 || count > 72) error(errors, field, field.equals("senha") ? "Senha deve ter entre 8 e 72 caracteres" : "A senha deve ter entre 8 e 72 caracteres");
        }
    }
    static String recoveryCpf(JsonNode body) {
        String value = digits(primitiveText(body.path("cpf")));
        var errors = new ArrayList<Map<String, String>>();
        if (!Cpf.valid(value)) error(errors, "cpf", value.isEmpty() ? "CPF e obrigatorio" : value.length() != 11 ? "CPF deve ter 11 digitos" : "CPF invalido");
        check(errors); return value;
    }
    static String code(JsonNode body) {
        String value = body.path("codigo").isNumber() ? body.path("codigo").asText() : trim(text(body, "codigo"));
        var errors = new ArrayList<Map<String, String>>();
        if (!value.matches("[0-9]{6}")) error(errors, "codigo", "Codigo deve ter 6 digitos");
        check(errors); return value;
    }
    static void punch(JsonNode body) {
        var errors = new ArrayList<Map<String, String>>();
        if (!text(body, "chaveIdempotencia").matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))
            error(errors, "chaveIdempotencia", "chaveIdempotencia deve ser um UUID v4 por acao de registro");
        for (String field : List.of("latitude", "longitude")) {
            JsonNode value = body.path(field);
            if (!value.isNumber() || !Double.isFinite(value.doubleValue()) || Math.abs(value.doubleValue()) > (field.equals("latitude") ? 90 : 180))
                error(errors, field, field.equals("latitude") ? "latitude deve ser um numero entre -90 e 90" : "longitude deve ser um numero entre -180 e 180");
        }
        if (body.has("accuracy") && (!body.path("accuracy").isNumber() || !Double.isFinite(body.path("accuracy").doubleValue()) || body.path("accuracy").doubleValue() <= 0))
            error(errors, "accuracy", "accuracy deve ser um numero positivo em metros");
        if (body.has("timestamp") && (!body.path("timestamp").isNumber() || !Double.isFinite(body.path("timestamp").doubleValue()) || Math.rint(body.path("timestamp").doubleValue()) != body.path("timestamp").doubleValue() || body.path("timestamp").longValue() <= 0 || body.path("timestamp").longValue() > 9007199254740991L))
            error(errors, "timestamp", "timestamp deve ser um inteiro positivo em milissegundos");
        check(errors);
    }
    private static void error(List<Map<String, String>> errors, String field, String message) { errors.add(Map.of("field", field, "location", "body", "message", message)); }
    private static void check(List<Map<String, String>> errors) { if (!errors.isEmpty()) throw new PublicPunchException(422, "VALIDATION_ERROR", "Dados de requisicao invalidos", errors); }
}
