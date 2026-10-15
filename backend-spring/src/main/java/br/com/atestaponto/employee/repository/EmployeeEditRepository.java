package br.com.atestaponto.employee.repository;

import br.com.atestaponto.employee.dto.EmployeeEditResponse;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EmployeeEditRepository {
    private final JdbcTemplate jdbc;

    public EmployeeEditRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Employee(long id, String nome, String cpf, String email, String telefone) {}
    public record Link(long id, long unitId, String cargo, String entrada,
                       String saidaAlmoco, String retornoAlmoco, String saida) {}

    public Optional<Employee> lockEmployee(long id) {
        return jdbc.query("SELECT id, nome, cpf, email, telefone FROM funcionarios WHERE id = ? FOR UPDATE",
                (row, index) -> new Employee(row.getLong("id"), row.getString("nome"), row.getString("cpf"),
                        row.getString("email"), row.getString("telefone")), id).stream().findFirst();
    }

    public Optional<Link> lockActiveLink(long employeeId) {
        return jdbc.query("""
                SELECT v.id, v.unidade_escolar_id, c.cargo,
                       TIME_FORMAT(v.horario_entrada, '%H:%i:%s') AS entrada,
                       TIME_FORMAT(v.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
                       TIME_FORMAT(v.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
                       TIME_FORMAT(v.horario_saida, '%H:%i:%s') AS saida
                FROM vinculos_funcionais v INNER JOIN cargos c ON c.id = v.cargo_id
                WHERE v.funcionario_id = ? AND v.status = 'ATIVO'
                ORDER BY v.id DESC LIMIT 1 FOR UPDATE
                """, (row, index) -> new Link(row.getLong("id"), row.getLong("unidade_escolar_id"),
                        row.getString("cargo"), row.getString("entrada"), row.getString("saida_almoco"),
                        row.getString("retorno_almoco"), row.getString("saida")), employeeId).stream().findFirst();
    }

    public boolean lockAuthorizedUnit(long unitId, long departmentId) {
        return !jdbc.query("SELECT id FROM unidades_escolares WHERE id = ? AND diretoria_ensino_id = ? FOR UPDATE",
                (row, index) -> row.getLong("id"), unitId, departmentId).isEmpty();
    }

    public boolean emailConflict(String email, long employeeId) {
        return !jdbc.query("SELECT id FROM funcionarios WHERE email = ? AND id <> ? LIMIT 1 FOR UPDATE",
                (row, index) -> row.getLong("id"), email, employeeId).isEmpty();
    }

    public void update(EmployeeEditResponse employee, long linkId) {
        // Registros já travados: zero linhas alteradas também representa uma edição válida.
        jdbc.update("UPDATE funcionarios SET nome = ?, email = ?, telefone = ? WHERE id = ?",
                employee.nome(), employee.email(), employee.telefone(), employee.id());
        jdbc.update("""
                UPDATE vinculos_funcionais SET cargo_id = ?, horario_entrada = ?, horario_saida_almoco = ?,
                    horario_volta_almoco = ?, horario_saida = ? WHERE id = ?
                """, employee.cargo_id(), employee.entrada(), employee.saida_almoco(),
                employee.retorno_almoco(), employee.saida(), linkId);
    }
}
