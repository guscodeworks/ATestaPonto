package br.com.atestaponto.punch.repository;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class PunchRepository {
    public record Employee(long id, String nome, String email, String cpf, boolean ativo) {}
    public record Dashboard(String nome, boolean ativo, String cargo,
            String entrada, String saidaAlmoco, String retornoAlmoco, String saida) {}
    public record Location(BigDecimal latitude, BigDecimal longitude, Integer radius) {}
    public record Previous(String hash, String response) {}
    public record Row(long linkId, String date, String type, String time, long schoolId, String schoolName) {}
    private final JdbcTemplate jdbc;
    public PunchRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private PreparedStatement prepare(Connection connection, String sql, boolean write, Object... parameters)
            throws SQLException {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || (write && (connection.isReadOnly()
                    || TransactionSynchronizationManager.isCurrentTransactionReadOnly()))) {
            throw new SQLException("Operacao de ponto exige transacao compativel");
        }
        PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
        for (int i = 0; i < parameters.length; i++) statement.setObject(i + 1, parameters[i]);
        return statement;
    }

    private <T> List<T> query(String sql, boolean lock, RowMapper<T> mapper, Object... parameters) {
        return jdbc.query(connection -> prepare(connection, sql, lock, parameters), mapper);
    }
    private <T> T first(List<T> rows) { return rows.isEmpty() ? null : rows.getFirst(); }

    public Employee lockEmployee(long id) {
        return first(query("SELECT id, cpf, nome, email, ativo FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE",
                true, (r, n) -> new Employee(r.getLong("id"), r.getString("nome"), r.getString("email"),
                        r.getString("cpf"), r.getBoolean("ativo")), id));
    }

    public Previous lockIdempotency(long employeeId, String key) {
        return first(query("SELECT requisicao_hash, resposta FROM ponto_idempotencia WHERE funcionario_id = ? AND chave = ? FOR UPDATE",
                true, (r, n) -> new Previous(r.getString("requisicao_hash"), r.getString("resposta")), employeeId, key));
    }

    public Long activeLink(long employeeId, boolean lock) {
        return first(query("SELECT id FROM vinculos_funcionais WHERE funcionario_id = ? AND status = 'ATIVO'"
                + " ORDER BY id DESC LIMIT 1" + (lock ? " FOR UPDATE" : ""), lock, (r, n) -> r.getLong("id"), employeeId));
    }

    public Location location(long linkId) {
        return first(query("""
                SELECT ue.latitude, ue.longitude, ue.raio_permitido_metros
                FROM unidades_escolares ue INNER JOIN vinculos_funcionais v ON v.unidade_escolar_id = ue.id
                WHERE v.id = ? LIMIT 1
                """, false, (r, n) -> new Location(r.getBigDecimal("latitude"), r.getBigDecimal("longitude"),
                        r.getObject("raio_permitido_metros", Integer.class)), linkId));
    }

    public Dashboard dashboard(long employeeId) {
        return first(query("""
                SELECT f.nome, f.ativo, lv.cargo, lv.entrada, lv.saida_almoco, lv.retorno_almoco, lv.saida
                FROM funcionarios f LEFT JOIN LATERAL (
                    SELECT c.cargo, TIME_FORMAT(v.horario_entrada, '%H:%i:%s') AS entrada,
                           TIME_FORMAT(v.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
                           TIME_FORMAT(v.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
                           TIME_FORMAT(v.horario_saida, '%H:%i:%s') AS saida
                    FROM vinculos_funcionais v INNER JOIN cargos c ON c.id = v.cargo_id
                    WHERE v.funcionario_id = f.id AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1
                ) lv ON TRUE WHERE f.id = ? LIMIT 1
                """, false, (r, n) -> new Dashboard(r.getString("nome"), r.getBoolean("ativo"), r.getString("cargo"),
                        r.getString("entrada"), r.getString("saida_almoco"), r.getString("retorno_almoco"), r.getString("saida")), employeeId));
    }

    public List<Row> day(long linkId, LocalDate date, boolean lock) {
        return query("""
                SELECT vinculo_funcional_id, data_referencia, tipo, TIME_FORMAT(registrado_em, '%H:%i:%s') AS hora
                FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia = ? ORDER BY tipo ASC
                """ + (lock ? " FOR UPDATE" : " LIMIT 4"), lock,
                (r, n) -> new Row(r.getLong("vinculo_funcional_id"), r.getString("data_referencia"),
                        r.getString("tipo"), r.getString("hora"), 0, null), linkId, date.toString());
    }

    public List<Row> history(long employeeId, LocalDate start, LocalDate end) {
        return query("""
                SELECT p.vinculo_funcional_id, p.data_referencia, p.tipo,
                       TIME_FORMAT(p.registrado_em, '%H:%i:%s') AS hora,
                       v.unidade_escolar_id, ue.nome AS unidade_escolar_nome
                FROM registro_de_pontos p
                INNER JOIN vinculos_funcionais v ON v.id = p.vinculo_funcional_id
                INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
                WHERE v.funcionario_id = ? AND p.data_referencia >= ? AND p.data_referencia <= ?
                ORDER BY p.data_referencia ASC, p.vinculo_funcional_id ASC, p.tipo ASC
                """, false, (r, n) -> new Row(r.getLong("vinculo_funcional_id"), r.getString("data_referencia"),
                        r.getString("tipo"), r.getString("hora"), r.getLong("unidade_escolar_id"),
                        r.getString("unidade_escolar_nome")), employeeId, start.toString(), end.toString());
    }

    public long insert(long linkId, LocalDate date, String type, String dateTime) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        // A chave unica protege a nova batida sem sobrescrever horarios anteriores.
        int count = jdbc.update(connection -> prepare(connection,
                "INSERT INTO registro_de_pontos (vinculo_funcional_id, data_referencia, tipo, registrado_em) VALUES (?, ?, ?, ?)",
                true, linkId, date.toString(), type, dateTime), keys);
        Number id = keys.getKey();
        if (count != 1 || id == null) throw new DataRetrievalFailureException("Registro de ponto nao persistido");
        return id.longValue();
    }

    public void saveIdempotency(long employeeId, String key, String hash, String response) {
        int count = jdbc.update(connection -> prepare(connection,
                "INSERT INTO ponto_idempotencia (funcionario_id, chave, requisicao_hash, resposta) VALUES (?, ?, ?, ?)",
                true, employeeId, key, hash, response));
        if (count != 1) throw new DataRetrievalFailureException("Idempotencia nao persistida");
    }
}
