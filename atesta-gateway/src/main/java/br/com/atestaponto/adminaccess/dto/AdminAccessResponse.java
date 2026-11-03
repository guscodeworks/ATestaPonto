package br.com.atestaponto.adminaccess.dto;

import java.util.List;

public final class AdminAccessResponse {
    private AdminAccessResponse() {}
    public record Access(long id, long usuario_administrativo_id, String perfil,
            Long diretoria_ensino_id, Long unidade_escolar_id, String status,
            String data_inicio, String data_fim, Long concedido_por_acesso_id,
            String criado_em, String atualizado_em, String usuario_cpf, String usuario_nome,
            String usuario_email, boolean usuario_ativo, String diretoria_ensino_nome,
            String unidade_escolar_nome, Long unidade_diretoria_ensino_id) {}
    public record Lookup(Access acesso) {}
    public record Page(List<Access> items, long total) {}
    public record Granted(Access acesso, boolean criou_identidade) {}
    public record Resource(Long educationDepartmentId, Long schoolUnitId) {}
    public record Option(long id, String nome, Long diretoria_ensino_id) {}
    public record Options(List<Option> diretorias, List<Option> unidades) {}
}
