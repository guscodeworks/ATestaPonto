package br.com.atestaponto.school.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

public record SchoolPreviewResponse(
        String nome,
        @JsonProperty("diretoria_ensino_id") long diretoriaEnsinoId,
        @JsonProperty("diretoria_ensino_nome") String diretoriaEnsinoNome,
        @JsonProperty("codigo_inep") String codigoInep,
        String cep,
        String endereco,
        String cidade,
        BigDecimal latitude,
        BigDecimal longitude,
        @JsonProperty("raio_permitido_metros") int raioPermitidoMetros,
        boolean ativa,
        @JsonProperty("origem_coordenadas") String origemCoordenadas,
        @JsonProperty("localizacao_pendente") boolean localizacaoPendente,
        @JsonProperty("mensagem_localizacao") String mensagemLocalizacao) {
}
