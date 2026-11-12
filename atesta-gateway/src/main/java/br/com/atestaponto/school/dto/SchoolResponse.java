package br.com.atestaponto.school.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

public record SchoolResponse(
        long id,
        @JsonProperty("diretoria_ensino_id") long diretoriaEnsinoId,
        String nome,
        BigDecimal latitude,
        BigDecimal longitude,
        @JsonProperty("raio_permitido_metros") int raioPermitidoMetros,
        boolean ativa,
        @JsonProperty("codigo_inep") String codigoInep,
        String endereco,
        String cidade) {
}
