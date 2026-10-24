package br.com.atestaponto.adminaccess.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Teste unitario da validacao de entrada; dados ficticios, sem persistencia. */
class PublicAccessInputTest {

    // CPF ficticio com digitos verificadores validos.
    private static final String CPF = "529.982.247-25";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static PublicAccessInput.Grant grant(String cpf, String name) throws Exception {
        return PublicAccessInput.grant(JSON.valueToTree(Map.of("cpf", cpf, "nome", name, "perfil", "diretor")), VALIDATOR);
    }

    private static Map<String, String> firstError(String cpf, String name) {
        var error = assertThrows(PublicAccessInput.Invalid.class, () -> grant(cpf, name));
        assertEquals("Dados de requisicao invalidos", error.getMessage());
        return error.details().getFirst();
    }

    @Test
    void acceptsValidCpfAndEscapesName() throws Exception {
        var grant = grant(CPF, "  Ana D'Avila  ");
        assertEquals("52998224725", grant.cpf());
        assertEquals("Ana D&#x27;Avila", grant.nome());
        assertEquals("DIRETOR", grant.perfil());
    }

    @ParameterizedTest
    @CsvSource({"'', CPF e obrigatorio", "123, CPF deve ter 11 digitos",
            "111.111.111-11, CPF invalido", "529.982.247-26, CPF invalido"})
    void rejectsInvalidCpf(String cpf, String message) {
        assertEquals(Map.of("field", "cpf", "location", "body", "message", message), firstError(cpf, "Ana Silva"));
    }

    @ParameterizedTest
    @CsvSource({"Ab, Nome deve ter entre 3 e 150 caracteres", "<script>, Nome contem caracteres invalidos"})
    void rejectsInvalidName(String name, String message) {
        assertEquals(Map.of("field", "nome", "location", "body", "message", message), firstError(CPF, name));
    }
}
