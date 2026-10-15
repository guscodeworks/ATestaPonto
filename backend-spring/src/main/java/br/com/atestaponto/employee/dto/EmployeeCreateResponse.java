package br.com.atestaponto.employee.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record EmployeeCreateResponse(
        Long id,
        String cpf,
        String nome,
        String email,
        String telefone,
        Boolean ativo,
        @JsonProperty("criado_em") String criadoEm,
        @JsonProperty("primeiro_acesso") Boolean primeiroAcesso,
        @JsonProperty("cargo_id") Long cargoId,
        @JsonProperty("cargo_nome") String cargoNome) {
}
