package br.com.atestaponto.auth.admin.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record AdminContextResponse(Admin admin, List<Access> acessos) {
    public record Admin(long id, String nome, String email, boolean ativo,
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime ultimo_login_em,
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime criado_em,
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime atualizado_em) {}

    public record Access(long id, long usuario_administrativo_id, String perfil,
            Long diretoria_ensino_id, Long unidade_escolar_id, String status,
            LocalDate data_inicio, LocalDate data_fim, Long concedido_por_acesso_id,
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime criado_em,
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime atualizado_em) {}
}
