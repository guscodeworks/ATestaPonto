package br.com.atestaponto.employee.dto;

public record EmployeeDetailResponse(
        long id,
        String nome,
        String cpf,
        String email,
        String telefone,
        String cargo,
        String entrada,
        String saida_almoco,
        String retorno_almoco,
        String saida) {
}
