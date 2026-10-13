package br.com.atestaponto.adminaccess.repository;

import br.com.atestaponto.adminaccess.dto.AdminAccessRequest;
import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.*;
import java.sql.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.*;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class AdminAccessRepository {
    public record Authorizer(long id, String perfil, Long diretoriaId, Long unidadeId) {}
    private static final String DETAIL = """
            SELECT aa.id, aa.usuario_administrativo_id, aa.perfil, aa.diretoria_ensino_id,
                   aa.unidade_escolar_id, aa.status, aa.data_inicio, aa.data_fim,
                   aa.concedido_por_acesso_id, aa.criado_em, aa.atualizado_em,
                   ua.cpf AS usuario_cpf, ua.nome AS usuario_nome, ua.email AS usuario_email,
                   ua.ativo AS usuario_ativo, de.nome AS diretoria_ensino_nome,
                   ue.nome AS unidade_escolar_nome, ue.diretoria_ensino_id AS unidade_diretoria_ensino_id
            FROM acessos_administrativos aa
            INNER JOIN usuarios_administrativos ua ON ua.id = aa.usuario_administrativo_id
            LEFT JOIN diretorias_ensino de ON de.id = aa.diretoria_ensino_id
            LEFT JOIN unidades_escolares ue ON ue.id = aa.unidade_escolar_id
            """;
    private static final DateTimeFormatter TIMESTAMP = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final JdbcTemplate jdbc;
    public AdminAccessRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private PreparedStatement prepare(Connection connection, String sql, boolean write, Object... parameters) throws SQLException {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || (write && (connection.isReadOnly() || TransactionSynchronizationManager.isCurrentTransactionReadOnly()))) {
            throw new SQLException("Acesso administrativo exige transacao compativel");
        }
        PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
        for (int i = 0; i < parameters.length; i++) statement.setObject(i + 1, parameters[i]);
        return statement;
    }
    private <T> List<T> query(String sql, boolean lock, RowMapper<T> mapper, Object... parameters) {
        return jdbc.query(connection -> prepare(connection, sql, lock, parameters), mapper);
    }
    private <T> T first(List<T> rows) { return rows.isEmpty() ? null : rows.getFirst(); }
    private String timestamp(ResultSet row, String column) throws SQLException {
        LocalDateTime value = row.getObject(column, LocalDateTime.class);
        return value == null ? null : TIMESTAMP.format(value.toInstant(ZoneOffset.UTC));
    }
    private Access mapAccess(ResultSet row, int index) throws SQLException {
        String cpf = row.getString("usuario_cpf");
        cpf = cpf == null ? "" : cpf.replaceAll("[^0-9]", "");
        return new Access(row.getLong("id"), row.getLong("usuario_administrativo_id"), row.getString("perfil"),
                row.getObject("diretoria_ensino_id", Long.class), row.getObject("unidade_escolar_id", Long.class),
                row.getString("status"), row.getString("data_inicio"), row.getString("data_fim"),
                row.getObject("concedido_por_acesso_id", Long.class), timestamp(row, "criado_em"), timestamp(row, "atualizado_em"),
                cpf.length() == 11 ? "***.***.***-" + cpf.substring(9) : "***.***.***-**",
                row.getString("usuario_nome"), row.getString("usuario_email"), row.getBoolean("usuario_ativo"),
                row.getString("diretoria_ensino_nome"), row.getString("unidade_escolar_nome"),
                row.getObject("unidade_diretoria_ensino_id", Long.class));
    }
    public Access find(long id, boolean lock) {
        return first(query(DETAIL + " WHERE aa.id = ? LIMIT 1" + (lock ? " FOR UPDATE" : ""), lock, this::mapAccess, id));
    }
    public Page list(AdminAccessRequest.ListQuery request) {
        List<Object> parameters = new ArrayList<>();
        List<String> clauses = new ArrayList<>();
        if (!request.global()) {
            if (!request.diretorias().isEmpty()) {
                clauses.add("aa.diretoria_ensino_id IN (" + String.join(",", Collections.nCopies(request.diretorias().size(), "?")) + ")");
                parameters.addAll(request.diretorias());
            }
            if (!request.unidades().isEmpty()) {
                clauses.add("aa.unidade_escolar_id IN (" + String.join(",", Collections.nCopies(request.unidades().size(), "?")) + ")");
                parameters.addAll(request.unidades());
            }
            if (clauses.isEmpty()) return new Page(List.of(), 0);
        }
        String where = clauses.isEmpty() ? "" : " WHERE " + String.join(" OR ", clauses);
        long total = query("SELECT COUNT(*) FROM acessos_administrativos aa" + where, false,
                (row, index) -> row.getLong(1), parameters.toArray()).getFirst();
        parameters.add(request.limit());
        parameters.add(request.offset());
        return new Page(query(DETAIL + where + " ORDER BY aa.criado_em DESC, aa.id DESC LIMIT ? OFFSET ?",
                false, this::mapAccess, parameters.toArray()), total);
    }
    public Authorizer lockAuthorizer(long id, long adminId) {
        return first(query("""
                SELECT aa.id, aa.perfil, aa.diretoria_ensino_id, aa.unidade_escolar_id
                FROM acessos_administrativos aa
                INNER JOIN usuarios_administrativos ua ON ua.id = aa.usuario_administrativo_id
                WHERE aa.id = ? AND aa.usuario_administrativo_id = ? AND ua.ativo = 1 AND aa.status = 'ATIVO'
                  AND (aa.data_inicio IS NULL OR aa.data_inicio <= CURRENT_DATE)
                  AND (aa.data_fim IS NULL OR aa.data_fim >= CURRENT_DATE)
                LIMIT 1 FOR UPDATE
                """, true, (row, index) -> new Authorizer(row.getLong("id"), row.getString("perfil"),
                        row.getObject("diretoria_ensino_id", Long.class), row.getObject("unidade_escolar_id", Long.class)), id, adminId));
    }
    public Resource department(long id, boolean lock) {
        return first(query("SELECT id FROM diretorias_ensino WHERE id = ? LIMIT 1" + (lock ? " FOR UPDATE" : ""),
                lock, (row, index) -> new Resource(row.getLong("id"), null), id));
    }
    public Resource school(long id, boolean lock) {
        return first(query("SELECT id, diretoria_ensino_id FROM unidades_escolares WHERE id = ? LIMIT 1" + (lock ? " FOR UPDATE" : ""),
                lock, (row, index) -> new Resource(row.getLong("diretoria_ensino_id"), row.getLong("id")), id));
    }
    public Options options(boolean departments, boolean schools) {
        return new Options(departments ? query("SELECT id, nome FROM diretorias_ensino ORDER BY nome ASC", false,
                (row, index) -> new Option(row.getLong("id"), row.getString("nome"), null)) : List.of(),
                schools ? query("SELECT id, nome, diretoria_ensino_id FROM unidades_escolares ORDER BY nome ASC", false,
                        (row, index) -> new Option(row.getLong("id"), row.getString("nome"), row.getLong("diretoria_ensino_id"))) : List.of());
    }
    public Long findActiveUser(String cpf) {
        return first(query("SELECT id FROM usuarios_administrativos WHERE cpf = ? AND ativo = 1 LIMIT 1 FOR UPDATE",
                true, (row, index) -> row.getLong("id"), cpf));
    }
    private long insert(String sql, Object... parameters) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        int count = jdbc.update(connection -> prepare(connection, sql, true, parameters), keys);
        Number id = keys.getKey();
        if (count != 1 || id == null) throw new DataRetrievalFailureException("Falha ao obter ID administrativo");
        return id.longValue();
    }
    public long createUser(String cpf, String name, String email) {
        return insert("INSERT INTO usuarios_administrativos (cpf, nome, email, ativo) VALUES (?, ?, ?, 1)", cpf, name, email);
    }
    public long grant(long userId, AdminAccessRequest.Grant request) {
        return insert("""
                INSERT INTO acessos_administrativos (usuario_administrativo_id, perfil, diretoria_ensino_id,
                    unidade_escolar_id, status, data_inicio, data_fim, concedido_por_acesso_id)
                VALUES (?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, ?)
                """, userId, request.perfil(), request.diretoriaId(), request.unidadeId(), request.status(),
                request.dataInicio() == null ? null : request.dataInicio().toString(),
                request.dataFim() == null ? null : request.dataFim().toString(), request.acessoAutorizadorId());
    }
    public int changeStatus(long id, String previous, String next) {
        return jdbc.update(connection -> prepare(connection,
                "UPDATE acessos_administrativos SET status = ? WHERE id = ? AND status = ?", true, next, id, previous));
    }
}
