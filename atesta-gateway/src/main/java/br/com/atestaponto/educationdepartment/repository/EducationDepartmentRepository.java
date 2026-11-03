package br.com.atestaponto.educationdepartment.repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import br.com.atestaponto.educationdepartment.dto.EducationDepartmentRequest;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import br.com.atestaponto.educationdepartment.dto.EducationDepartmentResponse;

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

    public long create(EducationDepartmentRequest request) {
        GeneratedKeyHolder key = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO diretorias_ensino (nome, codigo, cidade_sede, ativo) VALUES (?, ?, ?, 1)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, request.nome().strip());
            statement.setString(2, request.codigo().strip());
            statement.setString(3, request.cidadeSede().strip());
            return statement;
        }, key);
        return java.util.Objects.requireNonNull(key.getKey()).longValue();
    }

    public void update(long id, EducationDepartmentRequest request) {
        jdbcTemplate.update("UPDATE diretorias_ensino SET nome = ?, codigo = ?, cidade_sede = ? WHERE id = ?",
                request.nome().strip(), request.codigo().strip(), request.cidadeSede().strip(), id);
    }

    public void changeStatus(long id, boolean active) {
        jdbcTemplate.update("UPDATE diretorias_ensino SET ativo = ? WHERE id = ?", active, id);
    }

    public Optional<EducationDepartmentResponse> findForUpdate(long id) {
        return jdbcTemplate.query(FIND_BY_ID + " FOR UPDATE", (row, number) -> new EducationDepartmentResponse(
                row.getLong("id"), row.getString("nome"), row.getString("codigo"),
                row.getString("cidade_sede"), row.getBoolean("ativo"),
                row.getObject("criado_em", LocalDateTime.class),
                row.getObject("atualizado_em", LocalDateTime.class)), id).stream().findFirst();
    }

    public boolean hasDependenciesForDeactivation(long id) {
        // Bloqueia escolas e intervalos de vínculos até o commit; criação escolar bloqueia a mesma DRE.
        List<SchoolState> schools = jdbcTemplate.query(
                "SELECT id, ativa FROM unidades_escolares WHERE diretoria_ensino_id = ? ORDER BY id FOR UPDATE",
                (row, number) -> new SchoolState(row.getLong("id"), row.getBoolean("ativa")), id);
        if (schools.stream().anyMatch(SchoolState::active)) return true;

        for (SchoolState school : schools) {
            List<String> links = jdbcTemplate.query(
                    "SELECT status FROM vinculos_funcionais WHERE unidade_escolar_id = ? FOR UPDATE",
                    (row, number) -> row.getString("status"), school.id());
            if (links.stream().anyMatch(status -> !"ENCERRADO".equals(status))) return true;
            if (hasAdministrativeAccess("unidade_escolar_id", school.id())) return true;
        }
        return hasAdministrativeAccess("diretoria_ensino_id", id);
    }

    private boolean hasAdministrativeAccess(String column, long id) {
        // A coluna vem somente das duas chamadas internas acima; valores são parametrizados.
        return !jdbcTemplate.query("SELECT id FROM acessos_administrativos WHERE " + column
                + " = ? AND status IN ('ATIVO', 'PENDENTE', 'SUSPENSO')"
                + " AND (data_fim IS NULL OR data_fim >= ?) FOR UPDATE",
                (row, number) -> row.getLong("id"), id,
                java.time.LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo"))).isEmpty();
    }

    private record SchoolState(long id, boolean active) { }

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

    public List<EducationDepartmentResponse> list(Boolean ativo) {
        String sql = ativo == null
                ? """
                  SELECT id, nome, codigo, cidade_sede, ativo, criado_em, atualizado_em
                  FROM diretorias_ensino
                  ORDER BY nome ASC
                  """
                : """
                  SELECT id, nome, codigo, cidade_sede, ativo, criado_em, atualizado_em
                  FROM diretorias_ensino
                  WHERE ativo = ?
                  ORDER BY nome ASC
                  """;

        return jdbcTemplate.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }

            PreparedStatement statement = connection.prepareStatement(sql);

            if (ativo != null) {
                statement.setBoolean(1, ativo);
            }

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
    }
}
