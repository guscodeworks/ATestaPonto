package br.com.atestaponto.school.dto;

import java.math.BigDecimal;

public record SchoolScopeResponse(long id, long diretoria_ensino_id, String nome,
        BigDecimal latitude, BigDecimal longitude, int raio_permitido_metros,
        boolean ativa, String codigo_inep, String endereco, String cidade,
        String criado_em, String atualizado_em) {}
