package br.com.atestaponto.employee.dto;

public record EmployeeEditResponse(
        long id, String nome, String cpf, String email, String telefone,
        long cargo_id, String cargo, String entrada, String saida_almoco,
        String retorno_almoco, String saida) {
}
