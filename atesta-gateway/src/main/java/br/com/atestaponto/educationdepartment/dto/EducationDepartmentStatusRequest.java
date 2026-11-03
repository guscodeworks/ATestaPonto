package br.com.atestaponto.educationdepartment.dto;

import jakarta.validation.constraints.NotNull;

public record EducationDepartmentStatusRequest(@NotNull Boolean ativo) {
}
