package br.com.atestaponto.educationdepartment.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public record EducationDepartmentResponse(
        long id,
        String nome,
        String codigo,
        @JsonProperty("cidade_sede") String cidadeSede,
        boolean ativo,
        @JsonProperty("criado_em") LocalDateTime criadoEm,
        @JsonProperty("atualizado_em") LocalDateTime atualizadoEm) {
}
