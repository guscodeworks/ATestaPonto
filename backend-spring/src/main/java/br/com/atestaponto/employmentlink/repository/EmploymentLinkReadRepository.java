package br.com.atestaponto.employmentlink.repository;

import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EmploymentLinkReadRepository {
    private static final String SELECT = """
            SELECT v.id, v.unidade_escolar_id, de.id AS diretoria_ensino_id
            FROM vinculos_funcionais v
            INNER JOIN cargos c ON c.id = v.cargo_id
            INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
            LEFT JOIN diretorias_ensino de ON de.id = ue.diretoria_ensino_id
            """;
    private final JdbcTemplate jdbc;

    public EmploymentLinkReadRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<EmploymentLinkScopeResponse> findActiveByEmployeeId(long employeeId) {
        return query(SELECT + " WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1",
                employeeId).stream().findFirst();
    }

    public Optional<EmploymentLinkScopeResponse> findVisibleForAdminByEmployeeId(long employeeId) {
        return query(SELECT + """
                INNER JOIN funcionarios f ON f.id = v.funcionario_id
                WHERE v.funcionario_id = ?
                  AND ((f.ativo = 1 AND v.status = 'ATIVO')
                    OR (f.ativo = 0 AND v.status <> 'ATIVO'))
                ORDER BY v.id DESC
                LIMIT 1
                """, employeeId).stream().findFirst();
    }

    public Optional<EmploymentLinkScopeResponse> findLatestByEmployeeId(long employeeId) {
        return query(SELECT + " WHERE v.funcionario_id = ? ORDER BY v.id DESC LIMIT 1", employeeId)
                .stream().findFirst();
    }

    private List<EmploymentLinkScopeResponse> query(String sql, long employeeId) {
        return jdbc.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(sql);
            statement.setLong(1, employeeId);
            statement.setQueryTimeout(3);
            return statement;
        }, (row, index) -> new EmploymentLinkScopeResponse(
                row.getLong("id"), row.getLong("unidade_escolar_id"),
                row.getObject("diretoria_ensino_id", Long.class)));
    }
}
