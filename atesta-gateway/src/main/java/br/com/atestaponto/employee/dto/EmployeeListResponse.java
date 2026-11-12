package br.com.atestaponto.employee.dto;

import java.util.List;

public record EmployeeListResponse(List<Item> items, Pagination pagination) {
    public record Pagination(long page, int limit, long total) {}

    public record Item(
            long id,
            String nome,
            String cpf,
            String email,
            String telefone,
            boolean ativo,
            String desativado_em,
            String criado_em,
            Long cargo_id,
            String cargo,
            String entrada,
            String saida_almoco,
            String retorno_almoco,
            String saida) {
    }
}
