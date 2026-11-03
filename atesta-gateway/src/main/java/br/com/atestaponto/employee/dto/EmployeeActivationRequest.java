package br.com.atestaponto.employee.dto;

import br.com.atestaponto.json.StrictIntegerDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record EmployeeActivationRequest(
        @NotNull String confirmacao,
        @JsonDeserialize(using = StrictIntegerDeserializer.class)
        @NotNull @Positive @Max(9007199254740991L) Long vinculo_id,
        @JsonDeserialize(using = StrictIntegerDeserializer.class)
        @NotNull @Positive @Max(9007199254740991L) Long unidade_escolar_id,
        @JsonDeserialize(using = StrictIntegerDeserializer.class)
        @NotNull @Positive @Max(9007199254740991L) Long diretoria_ensino_id) {
}
