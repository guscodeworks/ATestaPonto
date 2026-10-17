package br.com.atestaponto.school.dto;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

public final class PublicSchoolInput {
    private PublicSchoolInput() {}

    public static String single(MultiValueMap<String, String> query, String field, String fallback) {
        var values = query.get(field);
        if (values == null) return fallback;
        if (values.size() != 1) throw invalid(field, "query", field + " invalido");
        return values.getFirst();
    }

    public static long integer(String value, long max, String field, String location) {
        try {
            if (value == null || !value.matches("[+]?[0-9]+")) throw new NumberFormatException();
            long id = Long.parseLong(value);
            if (id < 1 || id > max) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException failure) {
            String message = switch (field) {
                case "id" -> "ID de escola invalido";
                case "page" -> "page deve ser >= 1";
                case "limit" -> "limit deve ser entre 1 e 100";
                default -> field + " invalido";
            };
            throw invalid(field, location, message);
        }
    }

    public static Invalid invalid(String field, String location, String message) {
        return new Invalid(field, location, message);
    }

    public static final class Invalid extends ResponseStatusException {
        private final List<Map<String, String>> details;
        private Invalid(String field, String location, String message) {
            super(HttpStatus.UNPROCESSABLE_ENTITY, "Dados de requisicao invalidos");
            details = List.of(Map.of("field", field, "location", location, "message", message));
        }
        public List<Map<String, String>> details() { return details; }
    }
}
