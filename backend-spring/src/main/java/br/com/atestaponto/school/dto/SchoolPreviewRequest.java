package br.com.atestaponto.school.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Min;

public record SchoolPreviewRequest(
        @NotBlank String nome,
        @JsonProperty("diretoria_ensino_id")
        @JsonDeserialize(using = StrictIntegerDeserializer.class)
        @NotNull @Positive @Max(4294967295L) Long diretoriaEnsinoId,
        @NotBlank String cep,
        @JsonProperty("codigo_inep") String codigoInep,
        @JsonProperty("raio_permitido_metros")
        @JsonDeserialize(using = StrictIntegerDeserializer.class)
        @Min(10) @Max(1000) Long raioPermitidoMetros) {
}
