package br.com.atestaponto.school.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.List;

public record SchoolRegistrationRequest(
        @JsonDeserialize(using = StrictBooleanDeserializer.class)
        @NotNull Boolean escopo_global,
        @JsonDeserialize(contentUsing = StrictIntegerDeserializer.class)
        @NotNull List<@NotNull @Positive Long> unidades_escolares_ids) {
    public record Item(long id, String nome) {}
}
