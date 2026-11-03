package br.com.atestaponto.employee.repository;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;

class EmployeeCreateRepositoryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final EmployeeCreateRepository repository = new EmployeeCreateRepository(jdbc);
    private final LocalDate date = LocalDate.of(2026, 11, 2);

    @Test
    void insertionBindsLocalDateInsteadOfServerDate() throws Exception {
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(anyString(), eq(Statement.RETURN_GENERATED_KEYS))).thenReturn(statement);
        when(jdbc.update(any(PreparedStatementCreator.class), any(KeyHolder.class))).thenAnswer(call -> {
            call.<PreparedStatementCreator>getArgument(0).createPreparedStatement(connection);
            call.<KeyHolder>getArgument(1).getKeyList().add(Map.of("id", 7L));
            return 1;
        });
        assertEquals(7, repository.insertEmploymentLink(5, 20, 3, "07:00:00", "11:00:00", "12:00:00", "16:00:00", date));
        var sql = ArgumentCaptor.forClass(String.class);
        verify(connection).prepareStatement(sql.capture(), eq(Statement.RETURN_GENERATED_KEYS));
        assertTrue(sql.getValue().contains("VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')"));
        verify(statement).setObject(8, date);
        verify(statement).setLong(1, 5);
    }

    @Test
    void closureBindsDateAndLinkId() {
        repository.closeEmploymentLink(7, date);
        verify(jdbc).update("UPDATE vinculos_funcionais SET status = 'ENCERRADO', data_fim = ? WHERE id = ?", date, 7L);
    }
}
