package br.com.atestaponto.employeecredentials.repository;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse.Employee;
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
