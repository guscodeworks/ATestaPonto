package br.com.atestaponto.cargo.repository;

import br.com.atestaponto.cargo.dto.CargoResponse;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CargoReadRepository {
    private final JdbcTemplate jdbc;

    public CargoReadRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<CargoResponse> list() {
        return jdbc.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(
                    "SELECT id, cargo, ativo FROM cargos ORDER BY cargo ASC");
            statement.setQueryTimeout(3);
            return statement;
        }, (row, index) -> new CargoResponse(row.getLong("id"), row.getString("cargo"), row.getBoolean("ativo")));
    }
}
