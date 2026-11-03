package br.com.atestaponto.school.dto;

import br.com.atestaponto.json.StrictIntegerDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public record SchoolListRequest(
        @NotNull Boolean escopo_global,
        @JsonDeserialize(contentUsing = StrictIntegerDeserializer.class)
        @NotNull List<@NotNull @Positive Long> unidades_escolares_ids,
        @JsonDeserialize(using = StrictIntegerDeserializer.class)
        @Positive Long diretoria_ensino_id,
        Boolean ativa,
        @Size(max = 120) String q,
        @NotNull @Min(1) Long page,
        @NotNull @Min(1) @Max(100) Integer limit) {}
