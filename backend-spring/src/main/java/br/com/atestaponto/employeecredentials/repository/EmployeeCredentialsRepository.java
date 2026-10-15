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

    public boolean hasModernLoginTable() {
        return !jdbc.queryForList("""
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = 'login_funcionario' LIMIT 1
                """).isEmpty();
    }

    public AuthenticationEmployee findLoginEmployee(String cpf, String email, boolean modern) {
        return findAuthenticationEmployee(cpf != null ? "f.cpf" : "f.email",
                cpf != null ? cpf : email, modern, true);
    }

    public AuthenticationEmployee findTokenEmployee(long employeeId, boolean modern) {
        return findAuthenticationEmployee("f.id", employeeId, modern, false);
    }

    private AuthenticationEmployee findAuthenticationEmployee(String column, Object identifier,
                                                               boolean modern, boolean login) {
        String sql = modern ? """
                SELECT f.id, f.cpf, f.nome, f.email, f.ativo, lf.senha_hash, lf.primeiro_acesso
                FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id
                """ : """
                SELECT f.id, f.cpf, f.nome, f.email, f.ativo,
                       COALESCE(l.senha, f.senha) AS senha_hash, f.primeiro_acesso
                FROM funcionarios f LEFT JOIN login l ON l.id = f.login_id
                """;
        // Coluna escolhida apenas pelos metodos acima; identificador sempre parametrizado.
        sql += " WHERE " + column + " = ? AND f.ativo = 1";
        if (modern && login) {
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

    public Employee findRecoveryEmployee(String cpf, boolean modern) {
        String sql = modern ? """
                SELECT f.id, f.nome, f.email FROM funcionarios f
                INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id
                WHERE f.cpf = ? AND f.ativo = 1 AND lf.primeiro_acesso = FALSE
                AND f.email IS NOT NULL AND f.email <> '' LIMIT 1
                """ : """
                SELECT id, nome, email FROM funcionarios
                WHERE cpf = ? AND ativo = 1 AND primeiro_acesso = 0
                AND email IS NOT NULL AND email <> '' LIMIT 1
                """;
        var rows = jdbc.query(sql, (row, number) -> new Employee(
                row.getLong("id"), row.getString("nome"), row.getString("email")), cpf);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public Credential lockCredential(long employeeId, boolean modern) {
        String sql = modern ? """
                SELECT f.ativo, lf.primeiro_acesso FROM funcionarios f
                INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id
                WHERE f.id = ? LIMIT 1 FOR UPDATE
                """ : """
                SELECT f.ativo, f.primeiro_acesso FROM funcionarios f
                LEFT JOIN login l ON l.id = f.login_id
                WHERE f.id = ? LIMIT 1 FOR UPDATE
                """;
        var rows = jdbc.query(sql, (row, number) -> {
            int firstAccess = row.getInt("primeiro_acesso");
            Boolean state = row.wasNull() || (firstAccess != 0 && firstAccess != 1) ? null : firstAccess == 1;
            return new Credential(row.getInt("ativo") == 1, state);
        }, employeeId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public int updatePassword(long employeeId, String passwordHash, boolean firstAccess, boolean modern) {
        if (modern) {
            return jdbc.update("""
                    UPDATE login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id
                    SET lf.senha_hash = ?, lf.senha_alterada_em = CURRENT_TIMESTAMP,
                        lf.senha_temporaria_expira_em = NULL, lf.primeiro_acesso = FALSE
                    WHERE lf.funcionario_id = ? AND f.ativo = 1 AND lf.primeiro_acesso = ?
                    """, passwordHash, employeeId, firstAccess);
        }
        // O legado pode contar duas linhas: funcionario e login compartilham a credencial.
        return jdbc.update("""
                UPDATE funcionarios f LEFT JOIN login l ON l.id = f.login_id
                SET f.senha = ?, l.senha = ?, f.primeiro_acesso = 0, f.atualizado_em = CURRENT_TIMESTAMP
                WHERE f.id = ? AND f.ativo = 1 AND f.primeiro_acesso = ?
                """, passwordHash, passwordHash, employeeId, firstAccess);
    }
}
