package br.com.atestaponto.employee.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record EmployeeCreateRequest(
        // Nome chega escapado (ate 55 caracteres antes do escape); o limite aqui e a largura de funcionarios.nome.
        @NotBlank @Size(min = 3, max = 150) String nome,
        @NotBlank @Pattern(regexp = "[0-9]{11}") String cpf,
        @NotBlank @Email @Size(max = 150) String email,
        @Size(max = 20) String telefone,
        @NotNull Boolean ativo,
        @JsonProperty("unidade_escolar_id") @NotNull @Positive @Max(2147483647L) Long unidadeEscolarId,
        @NotBlank @Pattern(regexp = "FUNCIONARIO|INSPETOR|PROFESSOR") String cargo,
        @NotBlank @Pattern(regexp = "(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?") String entrada,
        @JsonProperty("saida_almoco") @NotBlank @Pattern(regexp = "(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?") String saidaAlmoco,
        @JsonProperty("retorno_almoco") @NotBlank @Pattern(regexp = "(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?") String retornoAlmoco,
        @NotBlank @Pattern(regexp = "(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?") String saida,
        @JsonProperty("senha_hash") @NotBlank @Size(max = 255) String senhaHash) {
}
