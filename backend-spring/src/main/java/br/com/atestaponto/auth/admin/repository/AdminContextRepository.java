package br.com.atestaponto.auth.admin.repository;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Admin;
import br.com.atestaponto.auth.admin.dto.AdminLoginResponse;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AdminContextRepository {
    private static final String FIND_ADMIN = """
            SELECT id, nome, email, ativo, ultimo_login_em, criado_em, atualizado_em
            FROM usuarios_administrativos
            WHERE id = ?
            LIMIT 1
            """;
    private static final String FIND_ACTIVE_ACCESSES = """
            SELECT id, usuario_administrativo_id, perfil, diretoria_ensino_id,
                   unidade_escolar_id, status, data_inicio, data_fim,
                   concedido_por_acesso_id, criado_em, atualizado_em
            FROM acessos_administrativos
            WHERE usuario_administrativo_id = ?
              AND status = 'ATIVO'
              AND (data_inicio IS NULL OR data_inicio <= CURRENT_DATE)
              AND (data_fim IS NULL OR data_fim >= CURRENT_DATE)
            ORDER BY criado_em DESC
            """;
    private static final String FIND_ACTIVE_ADMIN_BY_CPF = """
            SELECT id, nome, email, ativo
            FROM usuarios_administrativos
            WHERE cpf = ? AND ativo = 1
            LIMIT 1
            """;

    private final JdbcTemplate jdbc;

    public AdminContextRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Admin> findById(long id) {
        List<Admin> rows = jdbc.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A leitura administrativa exige conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(FIND_ADMIN);
            statement.setLong(1, id);
            statement.setQueryTimeout(3);
            return statement;
        }, (rs, index) -> new Admin(rs.getLong("id"),
                rs.getString("nome"), rs.getString("email"), rs.getBoolean("ativo"),
                rs.getObject("ultimo_login_em", LocalDateTime.class),
                rs.getObject("criado_em", LocalDateTime.class),
                rs.getObject("atualizado_em", LocalDateTime.class)));
        return rows.stream().findFirst();
    }

    public Optional<AdminLoginResponse.Admin> findActiveByCpf(String cpf) {
        List<AdminLoginResponse.Admin> rows = jdbc.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A leitura administrativa exige conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(FIND_ACTIVE_ADMIN_BY_CPF);
            statement.setString(1, cpf);
            statement.setQueryTimeout(3);
            return statement;
        }, (rs, index) -> new AdminLoginResponse.Admin(rs.getLong("id"),
                rs.getString("nome"), rs.getString("email"), rs.getBoolean("ativo")));
        return rows.stream().findFirst();
    }

    public List<Access> findActiveAccesses(long adminId) {
        return jdbc.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A leitura administrativa exige conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(FIND_ACTIVE_ACCESSES);
            statement.setLong(1, adminId);
            statement.setQueryTimeout(3);
            return statement;
        }, (rs, index) -> new Access(rs.getLong("id"), rs.getLong("usuario_administrativo_id"),
                rs.getString("perfil"), rs.getObject("diretoria_ensino_id", Long.class),
                rs.getObject("unidade_escolar_id", Long.class), rs.getString("status"),
                rs.getObject("data_inicio", LocalDate.class), rs.getObject("data_fim", LocalDate.class),
                rs.getObject("concedido_por_acesso_id", Long.class),
                rs.getObject("criado_em", LocalDateTime.class),
                rs.getObject("atualizado_em", LocalDateTime.class)));
    }
}
