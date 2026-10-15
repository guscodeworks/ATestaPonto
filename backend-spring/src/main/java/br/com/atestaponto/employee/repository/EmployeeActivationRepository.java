package br.com.atestaponto.employee.repository;

import br.com.atestaponto.employee.dto.EmployeeActivationResponse;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EmployeeActivationRepository {
    private static final DateTimeFormatter TIMESTAMP = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final JdbcTemplate jdbc;

    public EmployeeActivationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Link(long id, long unitId, long cargoId, String status, String cargo,
                       String entrada, String saidaAlmoco, String retornoAlmoco, String saida) {}
    public record Unit(long id, Long departmentId, boolean active) {}

    public Optional<Boolean> lockEmployee(long id) {
        return jdbc.query("SELECT ativo FROM funcionarios WHERE id = ? FOR UPDATE",
                (row, index) -> row.getInt("ativo") == 1, id).stream().findFirst();
    }

    public Optional<Link> lockActiveLink(long employeeId) {
        return lockLink(employeeId, true);
    }

    public Optional<Link> lockLatestLink(long employeeId) {
        return lockLink(employeeId, false);
    }

    private Optional<Link> lockLink(long employeeId, boolean activeOnly) {
        String sql = """
                SELECT v.id, v.unidade_escolar_id, v.cargo_id, v.status, c.cargo,
                       TIME_FORMAT(v.horario_entrada, '%H:%i:%s') AS entrada,
                       TIME_FORMAT(v.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
                       TIME_FORMAT(v.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
                       TIME_FORMAT(v.horario_saida, '%H:%i:%s') AS saida
                FROM vinculos_funcionais v INNER JOIN cargos c ON c.id = v.cargo_id
                WHERE v.funcionario_id = ?
                """ + (activeOnly ? " AND v.status = 'ATIVO'" : "") + " ORDER BY v.id DESC LIMIT 1 FOR UPDATE";
        return jdbc.query(sql, (row, index) -> new Link(row.getLong("id"),
                row.getLong("unidade_escolar_id"), row.getLong("cargo_id"), row.getString("status"),
                row.getString("cargo"), row.getString("entrada"), row.getString("saida_almoco"),
                row.getString("retorno_almoco"), row.getString("saida")), employeeId).stream().findFirst();
    }

    public Optional<Unit> lockUnit(long id) {
        return jdbc.query("SELECT id, diretoria_ensino_id, ativa FROM unidades_escolares WHERE id = ? FOR UPDATE",
                (row, index) -> new Unit(row.getLong("id"), row.getObject("diretoria_ensino_id", Long.class),
                        row.getInt("ativa") == 1), id).stream().findFirst();
    }

    public int changeStatus(long id, boolean active) {
        return jdbc.update("""
                UPDATE funcionarios SET ativo = ?, desativado_em = IF(? = 1, NULL, CURRENT_TIMESTAMP)
                WHERE id = ?
                """, active, active, id);
    }

    public int closeLink(long id) {
        return jdbc.update("UPDATE vinculos_funcionais SET status = 'ENCERRADO', data_fim = CURRENT_DATE WHERE id = ?",
                id);
    }

    public int createLink(long employeeId, Link link) {
        // Matrícula pertence ao vínculo histórico e não acompanha a reativação.
        return jdbc.update("""
                INSERT INTO vinculos_funcionais
                    (funcionario_id, unidade_escolar_id, cargo_id, horario_entrada, horario_saida_almoco,
                     horario_volta_almoco, horario_saida, data_inicio, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'ATIVO')
                """, employeeId, link.unitId(), link.cargoId(), link.entrada(), link.saidaAlmoco(),
                link.retornoAlmoco(), link.saida());
    }

    public EmployeeActivationResponse findStatus(long id) {
        return jdbc.queryForObject("SELECT id, ativo, desativado_em FROM funcionarios WHERE id = ?",
                (row, index) -> {
                    LocalDateTime disabledAt = row.getObject("desativado_em", LocalDateTime.class);
                    return new EmployeeActivationResponse(row.getLong("id"), row.getInt("ativo") == 1,
                            disabledAt == null ? null : TIMESTAMP.format(disabledAt.toInstant(ZoneOffset.UTC)));
                }, id);
    }
}
