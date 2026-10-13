package br.com.atestaponto.school.dto;

import java.math.BigDecimal;
import java.util.List;

public record SchoolListResponse(List<Item> items, Pagination pagination) {
    public record Pagination(long page, int limit, long total) {}

    public record Item(long id, long diretoria_ensino_id, String diretoria_ensino_nome,
            String nome, String codigo_inep, String endereco, String cidade,
            BigDecimal latitude, BigDecimal longitude, int raio_permitido_metros,
            boolean ativa, String criado_em, String atualizado_em) {}
}
