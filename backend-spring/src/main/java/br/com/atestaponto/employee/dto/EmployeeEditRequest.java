package br.com.atestaponto.employee.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.Map;

public record EmployeeEditRequest(
        @NotNull @Positive @Max(9007199254740991L) Long vinculo_id,
        @NotNull @Positive @Max(9007199254740991L) Long unidade_escolar_id,
        @NotNull @Positive @Max(9007199254740991L) Long diretoria_ensino_id,
        @NotNull Map<String, JsonNode> campos) {
}
