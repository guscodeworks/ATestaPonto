package br.com.atestaponto.report.repository;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DailyReportRepository {
    private final JdbcTemplate jdbc;

    public DailyReportRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Row(Long punchId, Long linkId, Long employeeId, String name,
            String email, String cpf, boolean active, Long jobId, Long schoolId,
            String schoolName, String type, String time) {}

    public List<Row> findByDate(LocalDate date, boolean global, List<Long> schoolIds) {
        if (!global && schoolIds.isEmpty()) return List.of();
        List<Object> params = new ArrayList<>(List.of(date, date, date));
        String scope = "";
        if (!global) {
            scope = " AND ue.id IN (" + String.join(",", Collections.nCopies(schoolIds.size(), "?")) + ")";
            params.addAll(schoolIds);
        }
        // Nao filtra ativo atual: preserva os vinculos vigentes na data historica.
        String sql = """
                SELECT p.id, v.id AS vinculo_funcional_id,
                       f.id AS funcionario_id, f.nome, f.email, f.cpf, f.ativo,
                       v.cargo_id, ue.id AS unidade_escolar_id, ue.nome AS unidade_escolar_nome,
                       p.tipo, TIME_FORMAT(p.registrado_em, '%H:%i:%s') AS horario
                FROM vinculos_funcionais v
                INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
                INNER JOIN funcionarios f ON f.id = v.funcionario_id
                LEFT JOIN registro_de_pontos p
                  ON p.vinculo_funcional_id = v.id AND p.data_referencia = ?
                WHERE (v.data_inicio IS NULL OR v.data_inicio <= ?)
                  AND (v.data_fim IS NULL OR v.data_fim >= ?)
                """ + scope + " ORDER BY f.nome ASC, v.id ASC, p.tipo ASC";
        return jdbc.query(sql, (rs, index) -> new Row(
                rs.getObject("id", Long.class), rs.getObject("vinculo_funcional_id", Long.class),
                rs.getObject("funcionario_id", Long.class), rs.getString("nome"),
                rs.getString("email"), rs.getString("cpf"), rs.getBoolean("ativo"),
                rs.getObject("cargo_id", Long.class), rs.getObject("unidade_escolar_id", Long.class),
                rs.getString("unidade_escolar_nome"), rs.getString("tipo"), rs.getString("horario")),
                params.toArray());
    }
}
