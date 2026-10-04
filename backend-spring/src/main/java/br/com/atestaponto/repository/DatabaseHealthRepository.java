package br.com.atestaponto.repository;

import java.sql.ResultSet;
import java.sql.Statement;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DatabaseHealthRepository {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseHealthRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean selectOne() {
        Boolean result = jdbcTemplate.execute((ConnectionCallback<Boolean>) connection -> {
            // Falha fechada se uma configuração externa desabilitar o modo de leitura.
            if (!connection.isReadOnly()) {
                return false;
            }
            try (Statement statement = connection.createStatement()) {
                statement.setQueryTimeout(3);
                try (ResultSet rows = statement.executeQuery("SELECT 1")) {
                    return rows.next() && rows.getInt(1) == 1;
                }
            }
        });
        return Boolean.TRUE.equals(result);
    }
}
