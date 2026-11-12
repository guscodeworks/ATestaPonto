package br.com.atestaponto.employee.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Teste unitario da adaptacao do contrato publico de funcionarios. */
class PublicEmployeeInputTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void editRejectsMarkupInNameWith422Details() {
        var error = assertThrows(PublicEmployeeInput.Invalid.class,
                () -> PublicEmployeeInput.edit(json.valueToTree(Map.of("nome", "<b>Ana</b>"))));
        assertEquals(422, error.getStatusCode().value());
        assertEquals(List.of(Map.of("field", "", "location", "body",
                "message", "Nome deve ter entre 3 e 150 caracteres, sem < ou >")), error.details());
    }

    @Test
    void editRejectsUnknownFields() {
        assertThrows(PublicEmployeeInput.Invalid.class,
                () -> PublicEmployeeInput.edit(json.valueToTree(Map.of("unidade_escolar_id", 9))));
    }

    @Test
    void editEscapesAcceptedName() {
        assertEquals("Ana D&#x27;Avila", PublicEmployeeInput.edit(json.valueToTree(Map.of("nome", " Ana D'Avila "))).get("nome").asText());
    }
}
