package br.com.atestaponto.report.repository;

import br.com.atestaponto.report.dto.HierarchicalReportRequest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class HierarchicalReportRepository {
    private final JdbcTemplate jdbc;

    public HierarchicalReportRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Group(Long departmentId, String departmentName, Long schoolId,
            String schoolName, long totalEmployees, long presentEmployees,
            long totalLinks, long totalSchools, long totalDepartments) {}

    private String placeholders(List<Long> ids) {
        return String.join(",", Collections.nCopies(ids.size(), "?"));
    }

    public boolean departmentVisible(Long id, HierarchicalReportRequest request) {
        if (request.escopo_global()) {
            return jdbc.queryForObject("SELECT COUNT(*) FROM diretorias_ensino WHERE id = ?",
                    Long.class, id) > 0;
        }
        if (request.diretorias_ensino_ids().contains(id)) {
            return jdbc.queryForObject("SELECT COUNT(*) FROM diretorias_ensino WHERE id = ?",
                    Long.class, id) > 0;
        }
        if (request.unidades_escolares_ids().isEmpty()) return false;
        List<Object> params = new ArrayList<>(List.of(id));
        params.addAll(request.unidades_escolares_ids());
        return jdbc.queryForObject("SELECT COUNT(*) FROM unidades_escolares WHERE diretoria_ensino_id = ?"
                + " AND id IN (" + placeholders(request.unidades_escolares_ids()) + ")",
                Long.class, params.toArray()) > 0;
    }

    public boolean schoolVisible(Long id, HierarchicalReportRequest request) {
        if (!request.escopo_global() && !request.unidades_escolares_ids().contains(id)) return false;
        return jdbc.queryForObject("SELECT COUNT(*) FROM unidades_escolares WHERE id = ?", Long.class, id) > 0;
    }

    public List<Group> aggregate(LocalDate date, HierarchicalReportRequest request, int level) {
        if (!request.escopo_global() && request.unidades_escolares_ids().isEmpty()
                && request.diretorias_ensino_ids().isEmpty()) return List.of();
        List<Object> params = new ArrayList<>();
        String schoolJoinScope = "";
        if (!request.escopo_global()) {
            // Mesmo uma DRE autorizada nao amplia a lista de escolas resolvida no Node.
            schoolJoinScope = request.unidades_escolares_ids().isEmpty() ? " AND 1 = 0"
                    : " AND ue.id IN (" + placeholders(request.unidades_escolares_ids()) + ")";
            params.addAll(request.unidades_escolares_ids());
        }
        params.add(date);
        params.add(date);
        params.add(date);
        String where = " WHERE 1 = 1";
        if (!request.escopo_global()) {
            where += " AND (ue.id IS NOT NULL";
            if (!request.diretorias_ensino_ids().isEmpty()) {
                where += " OR de.id IN (" + placeholders(request.diretorias_ensino_ids()) + ")";
                params.addAll(request.diretorias_ensino_ids());
            }
            where += ")";
        }
        if (request.diretoria_ensino_id() != null) {
            where += " AND de.id = ?";
            params.add(request.diretoria_ensino_id());
        }
        if (request.unidade_escolar_id() != null) {
            where += " AND ue.id = ?";
            params.add(request.unidade_escolar_id());
        }
        if (level == 2) where += " AND ue.id IS NOT NULL";
        String identifiers = switch (level) {
            case 0 -> "NULL AS diretoria_id, NULL AS diretoria_nome, NULL AS escola_id, NULL AS escola_nome";
            case 1 -> "de.id AS diretoria_id, de.nome AS diretoria_nome, NULL AS escola_id, NULL AS escola_nome";
            case 2 -> "de.id AS diretoria_id, de.nome AS diretoria_nome, ue.id AS escola_id, ue.nome AS escola_nome";
            default -> throw new IllegalArgumentException("Nivel de agregacao invalido");
        };
        String group = switch (level) {
            case 1 -> " GROUP BY de.id, de.nome ORDER BY de.nome ASC, de.id ASC";
            case 2 -> " GROUP BY de.id, de.nome, ue.id, ue.nome ORDER BY de.nome ASC, de.id ASC, ue.nome ASC, ue.id ASC";
            default -> "";
        };
        String sql = "SELECT " + identifiers + """
                , COUNT(DISTINCT f.id) AS total_funcionarios,
                  COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN f.id END) AS presentes,
                  COUNT(DISTINCT v.id) AS total_vinculos,
                  COUNT(DISTINCT ue.id) AS total_escolas,
                  COUNT(DISTINCT de.id) AS total_diretorias
                FROM diretorias_ensino de
                LEFT JOIN unidades_escolares ue ON ue.diretoria_ensino_id = de.id
                """ + schoolJoinScope + "\n" + """
                LEFT JOIN vinculos_funcionais v ON v.unidade_escolar_id = ue.id
                  AND (v.data_inicio IS NULL OR v.data_inicio <= ?)
                  AND (v.data_fim IS NULL OR v.data_fim >= ?)
                LEFT JOIN funcionarios f ON f.id = v.funcionario_id
                LEFT JOIN registro_de_pontos p ON p.vinculo_funcional_id = v.id AND p.data_referencia = ?
                """ + where + group;
        return jdbc.query(sql, (rs, index) -> new Group(
                rs.getObject("diretoria_id", Long.class), rs.getString("diretoria_nome"),
                rs.getObject("escola_id", Long.class), rs.getString("escola_nome"),
                rs.getLong("total_funcionarios"), rs.getLong("presentes"),
                rs.getLong("total_vinculos"), rs.getLong("total_escolas"),
                rs.getLong("total_diretorias")), params.toArray());
    }
}
