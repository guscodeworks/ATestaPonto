package br.com.atestaponto.employeecredentials.repository;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse.Employee;
import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse.AuthenticationEmployee;
import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse.ActiveLink;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EmployeeCredentialsRepository {
    private final JdbcTemplate jdbc;

    public EmployeeCredentialsRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Credential(boolean active, Boolean firstAccess) {}

    public AuthenticationEmployee findLoginEmployee(String cpf, String email) {
        return findAuthenticationEmployee(cpf != null ? "f.cpf" : "f.email",
                cpf != null ? cpf : email, true);
    }

    public AuthenticationEmployee findTokenEmployee(long employeeId) {
        return findAuthenticationEmployee("f.id", employeeId, false);
    }

    private AuthenticationEmployee findAuthenticationEmployee(String column, Object identifier, boolean login) {
        String sql = """
                SELECT f.id, f.cpf, f.nome, f.email, f.ativo, lf.senha_hash, lf.primeiro_acesso
                FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id
                """;
        // Coluna escolhida apenas pelos metodos acima; identificador sempre parametrizado.
        sql += " WHERE " + column + " = ? AND f.ativo = 1";
        if (login) {
            sql += " AND (lf.senha_temporaria_expira_em IS NULL"
                    + " OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP)";
        }
        var rows = jdbc.query(sql + " LIMIT 1", (row, number) -> {
            int firstAccess = row.getInt("primeiro_acesso");
            Boolean state = row.wasNull() || (firstAccess != 0 && firstAccess != 1) ? null : firstAccess == 1;
            return new AuthenticationEmployee(row.getLong("id"), row.getString("cpf"),
                    row.getString("nome"), row.getString("email"), row.getInt("ativo") == 1,
                    row.getString("senha_hash"), state);
        }, identifier);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public ActiveLink findActiveLink(long employeeId) {
        var rows = jdbc.query("""
                SELECT v.id, v.unidade_escolar_id FROM vinculos_funcionais v
                INNER JOIN funcionarios f ON f.id = v.funcionario_id
                WHERE v.funcionario_id = ? AND f.ativo = 1 AND v.status = 'ATIVO'
                ORDER BY v.id DESC LIMIT 1
                """, (row, number) -> new ActiveLink(row.getLong("id"), row.getLong("unidade_escolar_id")), employeeId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public int updateLastLogin(long employeeId) {
        return jdbc.update("""
                UPDATE login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id
                SET lf.ultimo_login_em = CURRENT_TIMESTAMP
                WHERE lf.funcionario_id = ? AND f.ativo = 1 AND lf.primeiro_acesso = FALSE
                  AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP)
                  AND EXISTS (SELECT 1 FROM vinculos_funcionais v
                              WHERE v.funcionario_id = f.id AND v.status = 'ATIVO')
                """, employeeId);
    }

    public Employee findRecoveryEmployee(String cpf) {
        var rows = jdbc.query("""
                SELECT f.id, f.nome, f.email FROM funcionarios f
                INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id
                WHERE f.cpf = ? AND f.ativo = 1 AND lf.primeiro_acesso = FALSE
                AND f.email IS NOT NULL AND f.email <> '' LIMIT 1
                """, (row, number) -> new Employee(
                row.getLong("id"), row.getString("nome"), row.getString("email")), cpf);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public Credential lockCredential(long employeeId) {
        var rows = jdbc.query("""
                SELECT f.ativo, lf.primeiro_acesso FROM funcionarios f
                INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id
                WHERE f.id = ? LIMIT 1 FOR UPDATE
                """, (row, number) -> {
            int firstAccess = row.getInt("primeiro_acesso");
            Boolean state = row.wasNull() || (firstAccess != 0 && firstAccess != 1) ? null : firstAccess == 1;
            return new Credential(row.getInt("ativo") == 1, state);
        }, employeeId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public int updatePassword(long employeeId, String passwordHash, boolean firstAccess) {
        return jdbc.update("""
                UPDATE login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id
                SET lf.senha_hash = ?, lf.senha_alterada_em = CURRENT_TIMESTAMP,
                    lf.senha_temporaria_expira_em = NULL, lf.primeiro_acesso = FALSE
                WHERE lf.funcionario_id = ? AND f.ativo = 1 AND lf.primeiro_acesso = ?
                """, passwordHash, employeeId, firstAccess);
    }
}
