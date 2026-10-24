package br.com.atestaponto.employee.repository;

import br.com.atestaponto.employee.dto.EmployeeCreateResponse;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class EmployeeCreateRepository {
    private static final DateTimeFormatter TIMESTAMP = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final JdbcTemplate jdbc;

    public EmployeeCreateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean existsByCpfForUpdate(String cpf) {
        return !jdbc.query("SELECT id FROM funcionarios WHERE cpf = ? LIMIT 1 FOR UPDATE",
                (row, index) -> row.getLong("id"), cpf).isEmpty();
    }

    public boolean existsByEmailForUpdate(String email) {
        return !jdbc.query("SELECT id FROM funcionarios WHERE email = ? LIMIT 1 FOR UPDATE",
                (row, index) -> row.getLong("id"), email).isEmpty();
    }

    public boolean existsByCpf(String cpf) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM funcionarios WHERE cpf = ?", Long.class, cpf) > 0;
    }

    public boolean existsByEmail(String email) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM funcionarios WHERE email = ?", Long.class, email) > 0;
    }

    public boolean lockExistingSchoolUnit(long unitId) {
        return !jdbc.query("SELECT id FROM unidades_escolares WHERE id = ? LIMIT 1 FOR UPDATE",
                (row, index) -> row.getLong("id"), unitId).isEmpty();
    }

    public boolean lockAuthorizedSchoolUnit(long unitId, long departmentId) {
        return !jdbc.query("SELECT id FROM unidades_escolares WHERE id = ? AND diretoria_ensino_id = ? FOR UPDATE",
                (row, index) -> row.getLong("id"), unitId, departmentId).isEmpty();
    }

    public long findOrCreateCargo(String cargo) {
        // INSERT IGNORE deixa o índice UNIQUE resolver corridas sem atualizar cargo existente.
        jdbc.update("INSERT IGNORE INTO cargos (cargo) VALUES (?)", cargo);
        List<Long> ids = jdbc.query("SELECT id FROM cargos WHERE cargo = ? LIMIT 1 FOR UPDATE",
                (row, index) -> row.getLong("id"), cargo);
        return ids.stream().findFirst().orElseThrow(
                () -> new IllegalStateException("Falha ao obter o ID do cargo"));
    }

    public long insertEmployee(String cpf, String email, String nome, String telefone, boolean ativo) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO funcionarios (cpf, email, nome, telefone, ativo) VALUES (?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, cpf);
            statement.setString(2, email);
            statement.setString(3, nome);
            statement.setString(4, telefone);
            statement.setBoolean(5, ativo);
            return statement;
        }, keys);
        Number key = keys.getKey();
        if (key == null || key.longValue() < 1) {
            throw new IllegalStateException("Falha ao obter o ID do funcionario");
        }
        return key.longValue();
    }

    public void insertLogin(long employeeId, String passwordHash) {
        jdbc.update("""
                INSERT INTO login_funcionario
                    (funcionario_id, senha_hash, primeiro_acesso, senha_temporaria_expira_em)
                VALUES (?, ?, TRUE, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY))
                """, employeeId, passwordHash);
    }

    public long insertEmploymentLink(long employeeId, long unitId, long cargoId,
            String entrada, String saidaAlmoco, String retornoAlmoco, String saida) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO vinculos_funcionais
                        (funcionario_id, unidade_escolar_id, cargo_id, horario_entrada,
                         horario_saida_almoco, horario_volta_almoco, horario_saida, data_inicio, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'ATIVO')
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, employeeId);
            statement.setLong(2, unitId);
            statement.setLong(3, cargoId);
            statement.setString(4, entrada);
            statement.setString(5, saidaAlmoco);
            statement.setString(6, retornoAlmoco);
            statement.setString(7, saida);
            return statement;
        }, keys);
        Number key = keys.getKey();
        if (key == null || key.longValue() < 1) {
            throw new IllegalStateException("Falha ao obter o ID do vinculo funcional");
        }
        return key.longValue();
    }

    public void closeEmploymentLink(long linkId) {
        jdbc.update("UPDATE vinculos_funcionais SET status = 'ENCERRADO', data_fim = CURRENT_DATE WHERE id = ?",
                linkId);
    }

    public EmployeeCreateResponse findCreatedEmployee(long employeeId) {
        List<EmployeeCreateResponse> result = jdbc.query("""
                SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.criado_em,
                       lf.primeiro_acesso, c.id AS cargo_id, c.cargo AS cargo_nome
                FROM funcionarios f
                INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id
                INNER JOIN vinculos_funcionais v ON v.funcionario_id = f.id
                INNER JOIN cargos c ON c.id = v.cargo_id
                WHERE f.id = ?
                ORDER BY v.id DESC
                LIMIT 1
                """, employeeMapper(), employeeId);
        return result.stream().findFirst().orElseThrow(
                () -> new IllegalStateException("Funcionario criado nao foi localizado"));
    }

    private RowMapper<EmployeeCreateResponse> employeeMapper() {
        return (row, index) -> new EmployeeCreateResponse(
                row.getLong("id"), row.getString("cpf"), row.getString("nome"), row.getString("email"),
                row.getString("telefone"), row.getBoolean("ativo"), timestamp(row, "criado_em"),
                row.getBoolean("primeiro_acesso"), row.getLong("cargo_id"), row.getString("cargo_nome"));
    }

    private String timestamp(ResultSet row, String column) throws SQLException {
        LocalDateTime value = row.getObject(column, LocalDateTime.class);
        return value == null ? null : TIMESTAMP.format(value.toInstant(ZoneOffset.UTC));
    }
}
