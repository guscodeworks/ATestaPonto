package br.com.atestaponto.educationdepartment.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EducationDepartmentRequest(
        @NotBlank @Size(max = 150) String nome,
        @NotBlank @Size(max = 50) String codigo,
        @JsonProperty("cidade_sede") @NotBlank @Size(max = 100) String cidadeSede) {
}
