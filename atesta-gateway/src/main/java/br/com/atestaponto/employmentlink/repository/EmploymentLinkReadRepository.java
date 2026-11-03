package br.com.atestaponto.employmentlink.repository;

import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class EmploymentLinkReadRepository {
    private static final String SELECT = """
            SELECT v.id, v.unidade_escolar_id, de.id AS diretoria_ensino_id
            FROM vinculos_funcionais v
            INNER JOIN cargos c ON c.id = v.cargo_id
            INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
            LEFT JOIN diretorias_ensino de ON de.id = ue.diretoria_ensino_id
            """;
    private static final String ACTIVE = SELECT
            + " WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1";
    private static final String VISIBLE = SELECT + """
            INNER JOIN funcionarios f ON f.id = v.funcionario_id
            WHERE v.funcionario_id = ?
              AND ((f.ativo = 1 AND v.status = 'ATIVO')
                OR (f.ativo = 0 AND v.status <> 'ATIVO'))
            ORDER BY v.id DESC
            LIMIT 1
            """;
    private static final String LATEST = SELECT + " WHERE v.funcionario_id = ? ORDER BY v.id DESC LIMIT 1";
    private final JdbcTemplate jdbc;

    public EmploymentLinkReadRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<EmploymentLinkScopeResponse> findActiveByEmployeeId(long employeeId) {
        return query(ACTIVE, employeeId).stream().findFirst();
    }

    public Optional<EmploymentLinkScopeResponse> findVisibleForAdminByEmployeeId(long employeeId) {
        return query(VISIBLE, employeeId).stream().findFirst();
    }

    public Optional<EmploymentLinkScopeResponse> findLatestByEmployeeId(long employeeId) {
        return query(LATEST, employeeId).stream().findFirst();
    }

    // Mesmas consultas, sem bloqueio, para revalidar escopo dentro de transacoes de escrita.
    public Optional<EmploymentLinkScopeResponse> findActiveByEmployeeIdInWriteTransaction(long employeeId) {
        return queryInWriteTransaction(ACTIVE, employeeId).stream().findFirst();
    }

    public Optional<EmploymentLinkScopeResponse> findVisibleForAdminByEmployeeIdInWriteTransaction(long employeeId) {
        return queryInWriteTransaction(VISIBLE, employeeId).stream().findFirst();
    }

    public Optional<EmploymentLinkScopeResponse> findLatestByEmployeeIdInWriteTransaction(long employeeId) {
        return queryInWriteTransaction(LATEST, employeeId).stream().findFirst();
    }

    private List<EmploymentLinkScopeResponse> query(String sql, long employeeId) {
        return jdbc.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }
            return prepare(connection, sql, employeeId);
        }, this::map);
    }

    private List<EmploymentLinkScopeResponse> queryInWriteTransaction(String sql, long employeeId) {
        return jdbc.query(connection -> {
            if (connection.isReadOnly() || !TransactionSynchronizationManager.isActualTransactionActive()
                    || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
                throw new SQLException("A consulta exige uma transacao de escrita");
            }
            return prepare(connection, sql, employeeId);
        }, this::map);
    }

    private PreparedStatement prepare(Connection connection, String sql, long employeeId) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(sql);
        statement.setLong(1, employeeId);
        statement.setQueryTimeout(3);
        return statement;
    }

    private EmploymentLinkScopeResponse map(ResultSet row, int index) throws SQLException {
        return new EmploymentLinkScopeResponse(
                row.getLong("id"), row.getLong("unidade_escolar_id"),
                row.getObject("diretoria_ensino_id", Long.class));
    }
}
