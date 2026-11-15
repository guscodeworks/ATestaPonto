package br.com.atestaponto.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.atestaponto.employee.dto.EmployeeDetailRequest;
import br.com.atestaponto.employee.dto.EmployeeDetailResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;

class EmployeeRepositoryTest {
    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void detailReadsActiveStateFromEmployee(boolean active) throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var connection = mock(Connection.class);
        var statement = mock(PreparedStatement.class);
        var row = mock(ResultSet.class);
        when(connection.isReadOnly()).thenReturn(true);
        when(connection.prepareStatement(any(String.class))).thenAnswer(call -> {
            String sql = call.getArgument(0);
            assertTrue(sql.contains("SELECT f.id, f.nome, f.cpf, f.email, f.telefone, f.ativo"));
            return statement;
        });
        when(row.getLong("id")).thenReturn(5L);
        when(row.getBoolean("ativo")).thenReturn(active);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(call -> {
            PreparedStatementCreator query = call.getArgument(0);
            query.createPreparedStatement(connection);
            RowMapper<EmployeeDetailResponse> mapper = call.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        var detail = new EmployeeRepository(jdbc).findAdminEmployeeById(new EmployeeDetailRequest(5L, 50L)).orElseThrow();

        assertEquals(active, detail.ativo());
        verify(row).getBoolean("ativo");
        verify(statement).setObject(1, 5L);
        verify(statement).setObject(2, 50L);
    }
}
