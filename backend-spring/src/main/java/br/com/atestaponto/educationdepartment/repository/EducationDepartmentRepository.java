package br.com.atestaponto.educationdepartment.repository;

import br.com.atestaponto.educationdepartment.dto.EducationDepartmentResponse;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class EducationDepartmentRepository {

    private static final String FIND_BY_ID = """
            SELECT id, nome, codigo, cidade_sede, ativo, criado_em, atualizado_em
            FROM diretorias_ensino
            WHERE id = ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public EducationDepartmentRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Boolean> findActiveForSchoolCreation(long id) {
        List<Boolean> rows = jdbcTemplate.query(connection -> {
            if (connection.isReadOnly() || !TransactionSynchronizationManager.isActualTransactionActive()
                    || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
                throw new SQLException("A validacao de criacao exige uma transacao de escrita");
            }
            PreparedStatement statement = connection.prepareStatement(
                    "SELECT ativo FROM diretorias_ensino WHERE id = ? FOR UPDATE");
            statement.setLong(1, id);
            statement.setQueryTimeout(3);
            return statement;
        }, (row, rowNumber) -> row.getBoolean("ativo"));
        return rows.stream().findFirst();
    }

    public Optional<EducationDepartmentResponse> findById(long id) {
        List<EducationDepartmentResponse> rows = jdbcTemplate.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(FIND_BY_ID);
            statement.setLong(1, id);
            statement.setQueryTimeout(3);
            return statement;
        }, (row, rowNumber) -> new EducationDepartmentResponse(
                row.getLong("id"),
                row.getString("nome"),
                row.getString("codigo"),
                row.getString("cidade_sede"),
                row.getBoolean("ativo"),
                row.getObject("criado_em", LocalDateTime.class),
                row.getObject("atualizado_em", LocalDateTime.class)));
        return rows.stream().findFirst();
    }
}
