package br.com.atestaponto.report.dto;

import java.util.List;

public record HierarchicalReportResponse(String data_referencia, Summary resumo,
        List<Department> diretorias) {
    public record Summary(long total_funcionarios, long total_ativos,
            long presentes, long ausentes, long taxa_presenca_percent,
            long total_vinculos, long total_escolas, long total_diretorias) {}

    public record School(Long unidade_escolar_id, String unidade_escolar_nome,
            Summary resumo) {}

    public record Department(Long diretoria_ensino_id, String diretoria_ensino_nome,
            Summary resumo, List<School> escolas) {}
}
