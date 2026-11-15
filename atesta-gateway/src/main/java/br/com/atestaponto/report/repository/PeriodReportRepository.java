package br.com.atestaponto.report.repository;

import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import br.com.atestaponto.report.repository.DailyReportRepository.Row;
import br.com.atestaponto.report.repository.HierarchicalReportRepository.Group;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PeriodReportRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public PeriodReportRepository(JdbcTemplate jdbc) { this.jdbc = new NamedParameterJdbcTemplate(jdbc); }

    public record DatedRow(LocalDate date, Row row) {}

    public boolean employeeVisible(long id, Scope scope, Long department, Long school) {
        if (!scope.global() && scope.schools().isEmpty()) return false;
        var params = parameters(scope, department, school).addValue("employee", id);
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM vinculos_funcionais v
                JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
                WHERE v.funcionario_id = :employee
                """ + schoolScope(scope, department, school), params, Long.class) > 0;
    }

    public List<DatedRow> nominal(List<LocalDate> dates, Scope scope, Long department, Long school, Long employee) {
        if (!scope.global() && scope.schools().isEmpty()) return List.of();
        var params = parameters(scope, department, school);
        String days = days(dates, params);
        String employeeFilter = employee == null ? "" : " AND f.id = :employee";
        if (employee != null) params.addValue("employee", employee);
        return jdbc.query(days + """
                SELECT dias.data_referencia, p.id, v.id AS vinculo_funcional_id,
                       f.id AS funcionario_id, f.nome, f.email, f.cpf, f.ativo,
                       v.cargo_id, ue.id AS unidade_escolar_id, ue.nome AS unidade_escolar_nome,
                       p.tipo, TIME_FORMAT(p.registrado_em, '%H:%i:%s') AS horario
                FROM dias
                JOIN vinculos_funcionais v
                  ON (v.data_inicio IS NULL OR v.data_inicio <= dias.data_referencia)
                 AND (v.data_fim IS NULL OR v.data_fim >= dias.data_referencia)
                JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
                JOIN funcionarios f ON f.id = v.funcionario_id
                LEFT JOIN registro_de_pontos p ON p.vinculo_funcional_id = v.id
                  AND p.data_referencia = dias.data_referencia
                WHERE 1 = 1
                """ + schoolScope(scope, department, school) + employeeFilter
                + " ORDER BY dias.data_referencia, f.nome, v.id, p.tipo", params, (rs, index) -> new DatedRow(
                rs.getDate("data_referencia").toLocalDate(), new Row(rs.getObject("id", Long.class),
                rs.getObject("vinculo_funcional_id", Long.class), rs.getObject("funcionario_id", Long.class),
                rs.getString("nome"), rs.getString("email"), rs.getString("cpf"), rs.getBoolean("ativo"),
                rs.getObject("cargo_id", Long.class), rs.getObject("unidade_escolar_id", Long.class),
                rs.getString("unidade_escolar_nome"), rs.getString("tipo"), rs.getString("horario"))));
    }

    public List<Group> aggregate(List<LocalDate> dates, LocalDate today, Scope scope,
            Long department, Long school, int level) {
        if (!scope.global() && scope.schools().isEmpty() && scope.departments().isEmpty()) return List.of();
        var params = parameters(scope, department, school).addValue("today", Date.valueOf(today));
        String days = days(dates, params);
        String identifiers = switch (level) {
            case 0 -> "NULL AS diretoria_id, NULL AS diretoria_nome, NULL AS escola_id, NULL AS escola_nome";
            case 1 -> "de.id AS diretoria_id, de.nome AS diretoria_nome, NULL AS escola_id, NULL AS escola_nome";
            case 2 -> "de.id AS diretoria_id, de.nome AS diretoria_nome, ue.id AS escola_id, ue.nome AS escola_nome";
            default -> throw new IllegalArgumentException("Nivel de agregacao invalido");
        };
        String joinScope = scope.global() ? "" : scope.schools().isEmpty() ? " AND 1 = 0"
                : " AND ue.id IN (:schools)";
        String where = " WHERE 1 = 1";
        if (!scope.global()) {
            where += " AND (ue.id IS NOT NULL";
            if (!scope.departments().isEmpty()) where += " OR de.id IN (:departments)";
            where += ")";
        }
        if (department != null) where += " AND de.id = :department";
        if (school != null) where += " AND ue.id = :school";
        if (level == 2) where += " AND ue.id IS NOT NULL";
        String group = switch (level) {
            case 1 -> " GROUP BY de.id, de.nome ORDER BY de.nome, de.id";
            case 2 -> " GROUP BY de.id, de.nome, ue.id, ue.nome ORDER BY de.nome, de.id, ue.nome, ue.id";
            default -> "";
        };
        // Pessoa/data e vinculo/data evitam duplicacao por batidas e por multiplos vinculos.
        return jdbc.query(days + "SELECT " + identifiers + """
                , COUNT(DISTINCT CONCAT(dias.data_referencia, ':', f.id)) AS total_funcionarios,
                  COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN CONCAT(dias.data_referencia, ':', f.id) END) AS presentes,
                  COUNT(DISTINCT CONCAT(dias.data_referencia, ':', v.id)) AS total_vinculos,
                  COUNT(DISTINCT ue.id) AS total_escolas, COUNT(DISTINCT de.id) AS total_diretorias
                FROM dias CROSS JOIN diretorias_ensino de
                LEFT JOIN unidades_escolares ue ON ue.diretoria_ensino_id = de.id
                """ + joinScope + "\n" + """
                LEFT JOIN vinculos_funcionais v ON v.unidade_escolar_id = ue.id
                  AND dias.data_referencia <= :today
                  AND (v.data_inicio IS NULL OR v.data_inicio <= dias.data_referencia)
                  AND (v.data_fim IS NULL OR v.data_fim >= dias.data_referencia)
                LEFT JOIN funcionarios f ON f.id = v.funcionario_id
                LEFT JOIN registro_de_pontos p ON p.vinculo_funcional_id = v.id
                  AND p.data_referencia = dias.data_referencia
                  AND p.tipo IN ('ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA')
                """ + where + group, params, (rs, index) -> new Group(
                rs.getObject("diretoria_id", Long.class), rs.getString("diretoria_nome"),
                rs.getObject("escola_id", Long.class), rs.getString("escola_nome"),
                rs.getLong("total_funcionarios"), rs.getLong("presentes"), rs.getLong("total_vinculos"),
                rs.getLong("total_escolas"), rs.getLong("total_diretorias")));
    }

    private MapSqlParameterSource parameters(Scope scope, Long department, Long school) {
        return new MapSqlParameterSource().addValue("schools", scope.schools())
                .addValue("departments", scope.departments()).addValue("department", department).addValue("school", school);
    }

    private String schoolScope(Scope scope, Long department, Long school) {
        return (scope.global() ? "" : " AND ue.id IN (:schools)")
                + (department == null ? "" : " AND ue.diretoria_ensino_id = :department")
                + (school == null ? "" : " AND ue.id = :school");
    }

    private String days(List<LocalDate> dates, MapSqlParameterSource params) {
        if (dates.isEmpty() || dates.size() > 31) throw new IllegalArgumentException("Periodo invalido");
        var selects = new ArrayList<String>();
        for (int index = 0; index < dates.size(); index++) {
            selects.add("SELECT CAST(:date_" + index + " AS DATE) AS data_referencia");
            params.addValue("date_" + index, Date.valueOf(dates.get(index)));
        }
        return "WITH dias AS (" + String.join(" UNION ALL ", selects) + ") ";
    }
}
