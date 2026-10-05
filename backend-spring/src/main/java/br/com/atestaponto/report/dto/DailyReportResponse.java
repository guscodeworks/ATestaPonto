package br.com.atestaponto.report.dto;

import java.util.List;

public record DailyReportResponse(String date, long total_funcionarios,
        long total_funcionarios_ativos, List<EmployeeDay> presentes,
        List<EmployeeDay> ausentes, List<EmployeeDay> relatorio, Summary resumo) {

    public record Summary(long total_funcionarios, long total_ativos,
            long presentes, long ausentes, long taxa_presenca_percent) {}

    public record Employee(Long id, String nome, String email, String cpf,
            boolean ativo, Long cargo_id) {}

    public record Punch(Long id, String tipo, int sequencia, String registrado_em) {}

    // Ausencia de horario permanece {} para compatibilidade com a API Node.
    public record EmployeeDay(String id, Long vinculo_funcional_id,
            Long unidade_escolar_id, String unidade_escolar_nome,
            Employee funcionario, String status, int total_batidas,
            Object entrada, Object saida, List<Punch> registros) {}
}
