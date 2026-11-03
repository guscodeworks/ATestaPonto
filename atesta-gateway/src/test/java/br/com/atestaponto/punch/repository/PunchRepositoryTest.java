package br.com.atestaponto.punch.repository;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class PunchRepositoryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PunchRepository repository = new PunchRepository(jdbc);
    private final LocalDate date = LocalDate.of(2026, 11, 3);

    @AfterEach
    void clearTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void activeLinkUsesInclusiveVigencyAndLatestIdWithRequestedLock(boolean lock) throws Exception {
        repository.activeLink(5, date, lock);
        String sql = preparedQuery(5L, date.toString(), date.toString());
        assertTrue(sql.contains("status = 'ATIVO'"));
        assertTrue(sql.contains("data_inicio <= ? AND (data_fim IS NULL OR data_fim >= ?)"));
        assertTrue(sql.contains("ORDER BY id DESC LIMIT 1"));
        assertEquals(lock, sql.endsWith("FOR UPDATE"));
    }

    @Test
    void dashboardKeepsSameVigencyDate() throws Exception {
        repository.dashboard(5, date);
        String sql = preparedQuery(date.toString(), date.toString(), 5L);
        assertTrue(sql.contains("v.status = 'ATIVO'"));
        assertTrue(sql.contains("v.data_inicio <= ? AND (v.data_fim IS NULL OR v.data_fim >= ?)"));
        assertTrue(sql.contains("ORDER BY v.id DESC LIMIT 1"));
    }

    @Test
    void registrationLocksRowsForExactLinkAndDate() throws Exception {
        repository.day(7, date, true);
        String sql = preparedQuery(7L, date.toString());
        assertTrue(sql.contains("vinculo_funcional_id = ? AND data_referencia = ?"));
        assertTrue(sql.endsWith("FOR UPDATE"));
    }

    private String preparedQuery(Object... parameters) throws Exception {
        var creator = ArgumentCaptor.forClass(PreparedStatementCreator.class);
        verify(jdbc).query(creator.capture(), any(RowMapper.class));
        var connection = mock(Connection.class);
        var statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(anyString(), eq(Statement.RETURN_GENERATED_KEYS))).thenReturn(statement);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        creator.getValue().createPreparedStatement(connection);
        var sql = ArgumentCaptor.forClass(String.class);
        verify(connection).prepareStatement(sql.capture(), eq(Statement.RETURN_GENERATED_KEYS));
        for (int i = 0; i < parameters.length; i++) verify(statement).setObject(i + 1, parameters[i]);
        verifyNoMoreInteractions(statement);
        return sql.getValue();
    }
}
