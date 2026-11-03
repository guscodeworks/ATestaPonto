package br.com.atestaponto.employee.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record EmployeeDetailRequest(
        @NotNull @Positive @Max(9007199254740991L) Long funcionario_id,
        @NotNull @Positive @Max(9007199254740991L) Long vinculo_id) {
}
