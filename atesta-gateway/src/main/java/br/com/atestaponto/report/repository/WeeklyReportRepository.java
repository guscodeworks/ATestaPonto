package br.com.atestaponto.report.repository;

import java.sql.Date;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class WeeklyReportRepository {
    private static final String DAYS_AND_LINKS = """
            WITH dias AS (
                SELECT CAST(:data_0 AS DATE) AS data_referencia
                UNION ALL SELECT CAST(:data_1 AS DATE)
                UNION ALL SELECT CAST(:data_2 AS DATE)
                UNION ALL SELECT CAST(:data_3 AS DATE)
                UNION ALL SELECT CAST(:data_4 AS DATE)
                UNION ALL SELECT CAST(:data_5 AS DATE)
                UNION ALL SELECT CAST(:data_6 AS DATE)
            )
            SELECT dias.data_referencia,
                   COUNT(DISTINCT f.id) AS total_funcionarios,
                   COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN f.id END) AS presentes
            FROM dias
            LEFT JOIN vinculos_funcionais v
              ON (v.data_inicio IS NULL OR v.data_inicio <= dias.data_referencia)
             AND (v.data_fim IS NULL OR v.data_fim >= dias.data_referencia)
            """;

    private static final String AGGREGATION = """
            LEFT JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
            LEFT JOIN funcionarios f ON f.id = v.funcionario_id AND ue.id IS NOT NULL
            LEFT JOIN registro_de_pontos p
              ON p.vinculo_funcional_id = v.id AND p.data_referencia = dias.data_referencia
             AND p.tipo IN ('ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA')
            WHERE dias.data_referencia IS NOT NULL
            GROUP BY dias.data_referencia
            ORDER BY dias.data_referencia
            """;

    private static final String GLOBAL_SQL = DAYS_AND_LINKS + AGGREGATION;
    private static final String TERRITORIAL_SQL = DAYS_AND_LINKS
            + " AND v.unidade_escolar_id IN (:escolas_ids)\n" + AGGREGATION;

    private final NamedParameterJdbcTemplate jdbc;

    public WeeklyReportRepository(JdbcTemplate jdbc) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
    }

    public record Row(LocalDate date, long totalEmployees, long presentEmployees) {}

    public List<Row> aggregate(List<LocalDate> dates, boolean global, List<Long> schoolIds) {
        if (dates.size() > 7 || (global && !schoolIds.isEmpty())) {
            throw new IllegalArgumentException("Parametros de agregado semanal invalidos");
        }
        if (dates.isEmpty() || (!global && schoolIds.isEmpty())) return List.of();
        MapSqlParameterSource params = new MapSqlParameterSource();
        // O service envia somente datas apuraveis; posicoes restantes nao produzem linhas.
        for (int index = 0; index < 7; index++) {
            params.addValue("data_" + index,
                    index < dates.size() ? Date.valueOf(dates.get(index)) : null, Types.DATE);
        }
        if (!global) {
            params.addValue("escolas_ids", schoolIds, Types.BIGINT);
        }
        // Ambas as versoes sao fixas; datas e lista territorial entram somente por binding.
        return jdbc.execute(global ? GLOBAL_SQL : TERRITORIAL_SQL, params, statement -> {
            statement.setQueryTimeout(3);
            List<Row> rows = new ArrayList<>();
            try (var rs = statement.executeQuery()) {
                while (rs.next()) {
                    rows.add(new Row(rs.getDate("data_referencia").toLocalDate(),
                            rs.getLong("total_funcionarios"), rs.getLong("presentes")));
                }
            }
            return rows;
        });
    }
}
