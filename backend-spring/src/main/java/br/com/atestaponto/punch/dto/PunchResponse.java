package br.com.atestaponto.punch.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public final class PunchResponse {
    private PunchResponse() {}

    public record Registration(boolean replayed, JsonNode response) {}
    public record Registered(Punch ponto, Employee funcionario) {}
    public record Punch(long id, int sequencia, String tipo, String registrado_em, double distancia_metros) {}
    public record Employee(long id, String nome, String email, String cpf) {}
    public record EmployeeSummary(String nome, String cargo) {}
    public record Schedule(String entrada, String saida_almoco, String retorno_almoco, String saida) {}
    public record Day(String data_referencia, String entrada, String saida_almoco, String retorno_almoco, String saida) {}
    public record Today(EmployeeSummary funcionario, Schedule jornada, Day ponto,
            String proxima_batida, boolean jornada_concluida) {}
    public record History(String periodo, Summary resumo, List<HistoryDay> registros) {}
    public record Summary(long dias_com_registro, long jornadas_completas,
            long jornadas_incompletas, long total_minutos) {}
    public record HistoryDay(String data_referencia, String entrada, String saida_almoco,
            String retorno_almoco, String saida, Integer total_minutos, String status,
            long vinculo_funcional_id, long unidade_escolar_id, String unidade_escolar_nome) {}
}
