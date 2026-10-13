package br.com.atestaponto.school.repository;

import br.com.atestaponto.school.dto.SchoolListRequest;
import br.com.atestaponto.school.dto.SchoolListResponse;
import br.com.atestaponto.school.dto.SchoolResponse;
import br.com.atestaponto.school.dto.SchoolScopeResponse;
import br.com.atestaponto.school.dto.SchoolRegistrationRequest;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
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

    public SchoolListResponse listForAdmin(SchoolListRequest request) {
        if (!Boolean.TRUE.equals(request.escopo_global()) && request.unidades_escolares_ids().isEmpty()) {
            return new SchoolListResponse(List.of(),
                    new SchoolListResponse.Pagination(request.page(), request.limit(), 0));
        }
        List<String> conditions = new ArrayList<>();
        List<Object> parameters = new ArrayList<>();
        if (!Boolean.TRUE.equals(request.escopo_global())) {
            conditions.add("ue.id IN (" + String.join(",", Collections.nCopies(
                    request.unidades_escolares_ids().size(), "?")) + ")");
            parameters.addAll(request.unidades_escolares_ids());
        }
        if (request.diretoria_ensino_id() != null) {
            conditions.add("ue.diretoria_ensino_id = ?");
            parameters.add(request.diretoria_ensino_id());
        }
        if (request.ativa() != null) {
            conditions.add("ue.ativa = ?");
            parameters.add(request.ativa());
        }
        if (request.q() != null && !request.q().isBlank()) {
            String term = "%" + request.q().strip().replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_") + "%";
            conditions.add("(ue.nome LIKE ? OR ue.codigo_inep LIKE ?)");
            parameters.add(term);
            parameters.add(term);
        }
        String from = " FROM unidades_escolares ue INNER JOIN diretorias_ensino de"
                + " ON de.id = ue.diretoria_ensino_id"
                + (conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions));
        long total = queryAdmin("SELECT COUNT(*)" + from, parameters,
                (row, index) -> row.getLong(1)).getFirst();
        parameters.add(request.limit());
        parameters.add((request.page() - 1) * request.limit());
        List<SchoolListResponse.Item> items = queryAdmin("""
                SELECT ue.id, ue.diretoria_ensino_id, de.nome AS diretoria_ensino_nome,
                       ue.nome, ue.codigo_inep, ue.endereco, ue.cidade, ue.latitude, ue.longitude,
                       ue.raio_permitido_metros, ue.ativa, ue.criado_em, ue.atualizado_em
                """ + from + " ORDER BY ue.nome ASC, ue.id ASC LIMIT ? OFFSET ?", parameters,
                this::mapAdminSchool);
        return new SchoolListResponse(items,
                new SchoolListResponse.Pagination(request.page(), request.limit(), total));
    }

    private SchoolListResponse.Item mapAdminSchool(ResultSet row, int index) throws SQLException {
        return new SchoolListResponse.Item(row.getLong("id"),
                row.getLong("diretoria_ensino_id"), row.getString("diretoria_ensino_nome"),
                row.getString("nome"), row.getString("codigo_inep"), row.getString("endereco"),
                row.getString("cidade"), row.getBigDecimal("latitude"), row.getBigDecimal("longitude"),
                row.getInt("raio_permitido_metros"), row.getBoolean("ativa"),
                adminTimestamp(row, "criado_em"), adminTimestamp(row, "atualizado_em"));
    }

    public Optional<SchoolListResponse.Item> findForAdmin(long id) {
        return queryAdmin("""
                SELECT ue.id, ue.diretoria_ensino_id, de.nome AS diretoria_ensino_nome,
                       ue.nome, ue.codigo_inep, ue.endereco, ue.cidade, ue.latitude, ue.longitude,
                       ue.raio_permitido_metros, ue.ativa, ue.criado_em, ue.atualizado_em
                FROM unidades_escolares ue
                INNER JOIN diretorias_ensino de ON de.id = ue.diretoria_ensino_id
                WHERE ue.id = ? LIMIT 1
                """, List.of(id), this::mapAdminSchool).stream().findFirst();
    }

    private static final String SCOPE_SELECT = """
            SELECT id, diretoria_ensino_id, nome, latitude, longitude, raio_permitido_metros,
                   ativa, codigo_inep, endereco, cidade, criado_em, atualizado_em
            FROM unidades_escolares
            """;

    public Optional<SchoolScopeResponse> findForScope(long id) {
        return queryAdmin(SCOPE_SELECT + " WHERE id = ? LIMIT 1", List.of(id),
                this::mapScopeSchool).stream().findFirst();
    }

    public List<SchoolScopeResponse> listForScope(long educationDepartmentId) {
        return queryAdmin(SCOPE_SELECT + " WHERE diretoria_ensino_id = ? ORDER BY nome ASC",
                List.of(educationDepartmentId), this::mapScopeSchool);
    }

    private SchoolScopeResponse mapScopeSchool(ResultSet row, int index) throws SQLException {
        return new SchoolScopeResponse(row.getLong("id"), row.getLong("diretoria_ensino_id"),
                row.getString("nome"), row.getBigDecimal("latitude"), row.getBigDecimal("longitude"),
                row.getInt("raio_permitido_metros"), row.getBoolean("ativa"),
                row.getString("codigo_inep"), row.getString("endereco"), row.getString("cidade"),
                adminTimestamp(row, "criado_em"), adminTimestamp(row, "atualizado_em"));
    }

    public List<SchoolRegistrationRequest.Item> listForRegistration(SchoolRegistrationRequest request) {
        if (!Boolean.TRUE.equals(request.escopo_global()) && request.unidades_escolares_ids().isEmpty()) {
            return List.of();
        }
        List<Object> parameters = new ArrayList<>();
        String filter = "";
        if (!Boolean.TRUE.equals(request.escopo_global())) {
            parameters.addAll(request.unidades_escolares_ids());
            filter = " WHERE id IN (" + String.join(",", Collections.nCopies(parameters.size(), "?")) + ")";
        }
        return queryAdmin("SELECT id, nome FROM unidades_escolares" + filter + " ORDER BY nome ASC, id ASC",
                parameters, (row, index) -> new SchoolRegistrationRequest.Item(
                        row.getLong("id"), row.getString("nome")));
    }

    private <T> List<T> queryAdmin(String sql, List<Object> parameters, RowMapper<T> mapper) {
        return jdbcTemplate.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(sql);
            for (int index = 0; index < parameters.size(); index++) {
                statement.setObject(index + 1, parameters.get(index));
            }
            statement.setQueryTimeout(3);
            return statement;
        }, mapper);
    }

    private static final DateTimeFormatter ADMIN_TIMESTAMP = new DateTimeFormatterBuilder()
            .appendInstant(3).toFormatter();

    private String adminTimestamp(ResultSet row, String column) throws SQLException {
        // O contrato Node interpreta os campos do banco como UTC e serializa milissegundos.
        LocalDateTime value = row.getObject(column, LocalDateTime.class);
        return value == null ? null : ADMIN_TIMESTAMP.format(value.toInstant(ZoneOffset.UTC));
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
