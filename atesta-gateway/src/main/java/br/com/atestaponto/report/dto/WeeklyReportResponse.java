package br.com.atestaponto.report.dto;

import java.util.List;

public record WeeklyReportResponse(String data_referencia, String data_inicio,
        String data_fim, String data_atual, Summary resumo, List<Day> dias) {

    // Totais em pessoa-dia, nao pessoas unicas ao longo da semana.
    public record Summary(long total_previstos, long total_presencas,
            long total_ausencias, long taxa_presenca_percent) {}

    public record Day(String data, boolean futuro, DailyReportResponse.Summary resumo) {}
}
