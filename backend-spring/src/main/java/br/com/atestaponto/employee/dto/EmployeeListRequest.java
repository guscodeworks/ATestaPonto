package br.com.atestaponto.employee.dto;

import br.com.atestaponto.report.dto.DailyReportSchoolIdDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public record EmployeeListRequest(
        @NotNull Boolean escopo_global,
        @JsonDeserialize(contentUsing = DailyReportSchoolIdDeserializer.class)
        @NotNull List<@NotNull @Positive Long> unidades_escolares_ids,
        Boolean ativo,
        @Pattern(regexp = "^(|FUNCIONARIO|INSPETOR|PROFESSOR)$") String cargo,
        // Express-validator sanitizes q with HTML escaping before it reaches this internal DTO.
        @Size(max = 720) String q,
        @NotNull @Min(1) @Max(9007199254740991L) Long page,
        @NotNull @Min(1) @Max(100) Integer limit) {
}
