package br.com.atestaponto.schoolqr.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.atestaponto.schoolqr.dto.SchoolQrResponse;
import br.com.atestaponto.schoolqr.repository.SchoolQrRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class SchoolQrServiceTest {
    private static final String BASE_URL = "https://ponto.example/";
    private static final String UNIT_KEY_PREFIX = "atestaponto:local:ponto:qr:unit:";

    private final ObjectMapper json = new ObjectMapper();
    private final SchoolQrRepository repository = mock(SchoolQrRepository.class);
    private final Map<String, String> records = new HashMap<>();
    private SchoolQrService service;

    @BeforeEach
    void setUp() throws Exception {
        records.clear();
        when(repository.get(anyString()))
                .thenAnswer(call -> records.get(call.getArgument(0)));

        // Simula a publicacao atomica sem Redis/Jedis real.
        doAnswer(call -> {
            String unitKey = call.getArgument(0);
            String tokenKey = call.getArgument(1);
            String storedRecord = call.getArgument(2);
            String unitId = call.getArgument(3);
            String tokenPrefix = call.getArgument(4);

            String previousJson = records.get(unitKey);
            if (previousJson != null) {
                JsonNode previous = json.readTree(previousJson);
                String previousHash = previous.path("tokenHash").asText(null);
                if (previousHash != null) {
                    records.remove(tokenPrefix + previousHash);
                }
            }

            records.put(unitKey, storedRecord);
            records.put(tokenKey, unitId);
            return null;
        }).when(repository).regenerate(
                anyString(), anyString(), anyString(), anyString(), anyString());

        service = new SchoolQrService(repository, json, null, "development");
    }

    @Test
    void generatesCurrentQrAndResolvesTokenToSchoolUnit() {
        JsonNode schoolId = json.getNodeFactory().numberNode(42L);

        SchoolQrResponse.Qr generated = service.generate(schoolId, BASE_URL);
        String token = tokenFrom(generated);

        assertEquals(42L, generated.unidade_escolar_id());
        assertTrue(generated.url().startsWith(
                "https://ponto.example/ponto/acessar?qr="));
        assertEquals(generated, service.current(schoolId, BASE_URL));
        assertEquals(
                new SchoolQrResponse.Unit(42L),
                service.resolve(TextNode.valueOf(token)));
    }

    @Test
    void generatingNewQrInvalidatesPreviousToken() {
        JsonNode schoolId = json.getNodeFactory().numberNode(7L);

        SchoolQrResponse.Qr first = service.generate(schoolId, BASE_URL);
        String firstToken = tokenFrom(first);

        SchoolQrResponse.Qr second = service.generate(schoolId, BASE_URL);
        String secondToken = tokenFrom(second);

        assertNotEquals(firstToken, secondToken);
        assertEquals(second, service.current(schoolId, BASE_URL));
        assertNull(service.resolve(TextNode.valueOf(firstToken)),
                "QR anterior deve ser revogado");
        assertEquals(
                new SchoolQrResponse.Unit(7L),
                service.resolve(TextNode.valueOf(secondToken)));
    }

    @Test
    void missingCurrentQrAndUnknownValidTokenResolveToNull() {
        JsonNode schoolId = json.getNodeFactory().numberNode(7L);

        assertNull(service.current(schoolId, BASE_URL));
        assertNull(service.resolve(TextNode.valueOf("a".repeat(64))));
    }

    @Test
    void tokenIndexWithoutCurrentQrDoesNotResolve() {
        JsonNode schoolId = json.getNodeFactory().numberNode(7L);
        String token = tokenFrom(service.generate(schoolId, BASE_URL));

        records.keySet().removeIf(key -> key.startsWith(UNIT_KEY_PREFIX));

        assertNull(service.current(schoolId, BASE_URL));
        assertNull(service.resolve(TextNode.valueOf(token)));
    }

    @ParameterizedTest
    @MethodSource("invalidTokenValues")
    void malformedTokensResolveToNull(JsonNode token) {
        assertNull(service.resolve(token));
    }

    static Stream<Arguments> invalidTokenValues() {
        return Stream.of(
                Arguments.of((Object) null),
                Arguments.of(NullNode.getInstance()),
                Arguments.of(JsonNodeFactory.instance.numberNode(123)),
                Arguments.of(JsonNodeFactory.instance.arrayNode()),
                Arguments.of(TextNode.valueOf("")),
                Arguments.of(TextNode.valueOf("a".repeat(63))),
                Arguments.of(TextNode.valueOf("a".repeat(65))),
                Arguments.of(TextNode.valueOf("g".repeat(64))));
    }

    private static String tokenFrom(SchoolQrResponse.Qr qr) {
        String query = URI.create(qr.url()).getRawQuery();
        return query.substring("qr=".length());
    }
}