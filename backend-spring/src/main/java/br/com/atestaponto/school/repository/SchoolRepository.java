package br.com.atestaponto.school.repository;

import br.com.atestaponto.school.dto.SchoolResponse;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class SchoolRepository {

    private static final String FIND_BY_ID = """
            SELECT id, diretoria_ensino_id, nome, latitude, longitude,
                   raio_permitido_metros, ativa, codigo_inep, endereco, cidade
            FROM unidades_escolares
            WHERE id = ?
            """;

    private static final String LIST_BY_EDUCATION_DEPARTMENT = """
            SELECT id, diretoria_ensino_id, nome, latitude, longitude,
                   raio_permitido_metros, ativa, codigo_inep, endereco, cidade
            FROM unidades_escolares
            WHERE diretoria_ensino_id = ?
            ORDER BY nome ASC
            """;

    private final JdbcTemplate jdbcTemplate;

    private static final String INSERT = """
            INSERT INTO unidades_escolares
                (diretoria_ensino_id, nome, latitude, longitude, raio_permitido_metros,
                 ativa, codigo_inep, endereco, cidade)
            VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, ?)
            """;

    public SchoolRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<SchoolResponse> findById(int id) {
        return querySchools(FIND_BY_ID, id).stream().findFirst();
    }

    public List<SchoolResponse> listByEducationDepartment(long educationDepartmentId) {
        return querySchools(LIST_BY_EDUCATION_DEPARTMENT, educationDepartmentId);
    }

    public boolean existsByNameInEducationDepartment(long departmentId, String normalizedName) {
        List<Long> rows = jdbcTemplate.query(connection -> {
            requireCreationTransaction(connection);
            // Inclui escolas inativas. Leitura corrente após adquirir o bloqueio da DRE.
            // Normaliza nomes históricos só na comparação, sem substituir a collation da coluna.
            PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM unidades_escolares WHERE diretoria_ensino_id = ? "
                            + "AND TRIM(REGEXP_REPLACE(nome, '[[:space:]]+', ' ')) = ? LIMIT 1 FOR UPDATE");
            statement.setLong(1, departmentId);
            statement.setString(2, normalizedName);
            statement.setQueryTimeout(3);
            return statement;
        }, (row, rowNumber) -> row.getLong("id"));
        return !rows.isEmpty();
    }

    public boolean existsByCodigoInep(String codigoInep) {
        List<Long> rows = jdbcTemplate.query(connection -> {
            requireCreationTransaction(connection);
            PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM unidades_escolares WHERE codigo_inep = ? LIMIT 1");
            statement.setString(1, codigoInep);
            statement.setQueryTimeout(3);
            return statement;
        }, (row, rowNumber) -> row.getLong("id"));
        return !rows.isEmpty();
    }

    public SchoolResponse create(long departmentId, String name, BigDecimal latitude,
            BigDecimal longitude, int radius, String codigoInep, String address, String city) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        int inserted = jdbcTemplate.update(connection -> {
            requireCreationTransaction(connection);
            PreparedStatement statement = connection.prepareStatement(INSERT, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, departmentId);
            statement.setString(2, name);
            statement.setBigDecimal(3, latitude);
            statement.setBigDecimal(4, longitude);
            statement.setInt(5, radius);
            statement.setString(6, codigoInep);
            statement.setString(7, address);
            statement.setString(8, city);
            statement.setQueryTimeout(3);
            return statement;
        }, keys);
        Number id = keys.getKey();
        if (inserted != 1 || id == null) {
            throw new DataRetrievalFailureException("Nao foi possivel obter a escola criada");
        }
        return querySchools(FIND_BY_ID, id.longValue(), false).stream().findFirst()
                .orElseThrow(() -> new DataRetrievalFailureException("Escola criada nao encontrada"));
    }

    private void requireCreationTransaction(Connection connection) throws SQLException {
        if (connection.isReadOnly() || !TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new SQLException("A criacao exige uma transacao de escrita");
        }
    }

    private List<SchoolResponse> querySchools(String sql, long id) {
        return querySchools(sql, id, true);
    }

    private List<SchoolResponse> querySchools(String sql, long id, boolean readOnly) {
        return jdbcTemplate.query(connection -> {
            if (readOnly && !connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }
            if (!readOnly) {
                requireCreationTransaction(connection);
            }
            PreparedStatement statement = connection.prepareStatement(sql);
            statement.setLong(1, id);
            statement.setQueryTimeout(3);
            return statement;
        }, this::mapSchool);
    }

    private SchoolResponse mapSchool(ResultSet row, int rowNumber) throws SQLException {
        return new SchoolResponse(
                row.getLong("id"),
                row.getLong("diretoria_ensino_id"),
                row.getString("nome"),
                row.getBigDecimal("latitude"),
                row.getBigDecimal("longitude"),
                row.getInt("raio_permitido_metros"),
                row.getBoolean("ativa"),
                row.getString("codigo_inep"),
                row.getString("endereco"),
                row.getString("cidade"));
    }
}
