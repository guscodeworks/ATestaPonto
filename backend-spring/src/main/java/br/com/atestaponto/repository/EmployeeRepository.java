package br.com.atestaponto.repository;

import br.com.atestaponto.employee.dto.EmployeeDetailRequest;
import br.com.atestaponto.employee.dto.EmployeeDetailResponse;
import br.com.atestaponto.employee.dto.EmployeeListRequest;
import br.com.atestaponto.employee.dto.EmployeeListResponse;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class EmployeeRepository {
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private static final DateTimeFormatter TIMESTAMP = new DateTimeFormatterBuilder()
            .appendInstant(3).toFormatter();

    private static final String ADMIN_EMPLOYEE_FROM = """
            FROM funcionarios f
            LEFT JOIN vinculos_funcionais lvf
              ON lvf.id = (
                SELECT v2.id
                FROM vinculos_funcionais v2
                WHERE v2.funcionario_id = f.id
                  AND ((f.ativo = 1 AND v2.status = 'ATIVO')
                    OR (f.ativo = 0 AND v2.status <> 'ATIVO'))
                ORDER BY v2.id DESC
                LIMIT 1
              )
            LEFT JOIN cargos c ON c.id = lvf.cargo_id
            """;

    private final JdbcTemplate jdbc;

    public EmployeeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public EmployeeListResponse list(EmployeeListRequest request) {
        if (!Boolean.TRUE.equals(request.escopo_global()) && request.unidades_escolares_ids().isEmpty()) {
            return new EmployeeListResponse(List.of(),
                    new EmployeeListResponse.Pagination(request.page(), request.limit(), 0));
        }

        QueryParts query = employeeFilters(request);
        long total = query("SELECT COUNT(*) AS total " + ADMIN_EMPLOYEE_FROM + query.where(),
                query.parameters(), (row, index) -> row.getLong("total")).getFirst();

        List<Object> parameters = new ArrayList<>(query.parameters());
        parameters.add(request.limit());
        parameters.add(offset(request.page(), request.limit()));
        List<EmployeeListResponse.Item> items = query("""
                SELECT f.id, f.nome, f.cpf, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em,
                       c.id AS cargo_id, c.cargo,
                       TIME_FORMAT(lvf.horario_entrada, '%H:%i:%s') AS entrada,
                       TIME_FORMAT(lvf.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
                       TIME_FORMAT(lvf.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
                       TIME_FORMAT(lvf.horario_saida, '%H:%i:%s') AS saida
                """ + ADMIN_EMPLOYEE_FROM + query.where()
                + " ORDER BY f.id DESC LIMIT ? OFFSET ?", parameters, this::mapListItem);

        return new EmployeeListResponse(items,
                new EmployeeListResponse.Pagination(request.page(), request.limit(), total));
    }

    public Optional<EmployeeDetailResponse> findAdminEmployeeById(EmployeeDetailRequest request) {
        return query("""
                SELECT f.id, f.nome, f.cpf, f.email, f.telefone,
                       c.cargo,
                       TIME_FORMAT(lvf.horario_entrada, '%H:%i:%s') AS entrada,
                       TIME_FORMAT(lvf.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
                       TIME_FORMAT(lvf.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
                       TIME_FORMAT(lvf.horario_saida, '%H:%i:%s') AS saida
                """ + ADMIN_EMPLOYEE_FROM + " WHERE f.id = ? AND lvf.id = ? LIMIT 1",
                List.of(request.funcionario_id(), request.vinculo_id()), this::mapDetail).stream().findFirst();
    }

    private QueryParts employeeFilters(EmployeeListRequest request) {
        List<String> conditions = new ArrayList<>();
        List<Object> parameters = new ArrayList<>();

        if (request.ativo() != null) {
            conditions.add("f.ativo = ?");
            parameters.add(request.ativo());
        }
        String cargo = request.cargo() == null ? "" : request.cargo().strip().toUpperCase();
        if (!cargo.isEmpty()) {
            conditions.add("c.cargo = ?");
            parameters.add(cargo);
        }
        String search = request.q() == null ? "" : request.q().strip();
        if (!search.isEmpty()) {
            conditions.add("(f.nome LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%'))");
            parameters.add(search);
            parameters.add(search);
        }
        if (!Boolean.TRUE.equals(request.escopo_global())) {
            List<Long> units = request.unidades_escolares_ids().stream().distinct().toList();
            if (units.isEmpty()) {
                conditions.add("1 = 0");
            } else {
                conditions.add("lvf.unidade_escolar_id IN ("
                        + String.join(",", Collections.nCopies(units.size(), "?")) + ")");
                parameters.addAll(units);
            }
        }
        return new QueryParts(conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions), parameters);
    }

    private long offset(long page, int limit) {
        if (page < 1 || page > MAX_SAFE_INTEGER) {
            throw new IllegalArgumentException("Pagina invalida");
        }
        return Math.multiplyExact(page - 1, (long) limit);
    }

    private EmployeeListResponse.Item mapListItem(ResultSet row, int index) throws SQLException {
        return new EmployeeListResponse.Item(
                row.getLong("id"), row.getString("nome"), row.getString("cpf"), row.getString("email"),
                row.getString("telefone"), row.getBoolean("ativo"), timestamp(row, "desativado_em"),
                timestamp(row, "criado_em"), row.getObject("cargo_id", Long.class), row.getString("cargo"),
                row.getString("entrada"), row.getString("saida_almoco"), row.getString("retorno_almoco"),
                row.getString("saida"));
    }

    private EmployeeDetailResponse mapDetail(ResultSet row, int index) throws SQLException {
        return new EmployeeDetailResponse(
                row.getLong("id"), row.getString("nome"), row.getString("cpf"), row.getString("email"),
                row.getString("telefone"), row.getString("cargo"), row.getString("entrada"),
                row.getString("saida_almoco"), row.getString("retorno_almoco"), row.getString("saida"));
    }

    private String timestamp(ResultSet row, String column) throws SQLException {
        LocalDateTime value = row.getObject(column, LocalDateTime.class);
        return value == null ? null : TIMESTAMP.format(value.toInstant(ZoneOffset.UTC));
    }

    private <T> List<T> query(String sql, List<?> parameters, RowMapper<T> mapper) {
        return jdbc.query(connection -> {
            if (!connection.isReadOnly()) {
                throw new SQLException("A consulta exige uma conexao somente leitura");
            }
            PreparedStatement statement = connection.prepareStatement(sql);
            for (int index = 0; index < parameters.size(); index++) {
                statement.setObject(index + 1, parameters.get(index));
            }
            statement.setQueryTimeout(3);
            return statement;
        }, mapper);
    }

    private record QueryParts(String where, List<Object> parameters) {}
}
