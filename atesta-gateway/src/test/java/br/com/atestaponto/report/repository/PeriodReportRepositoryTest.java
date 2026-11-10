package br.com.atestaponto.report.repository;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.SqlProvider;

class PeriodReportRepositoryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PeriodReportRepository repository = new PeriodReportRepository(jdbc);
    private final Scope scope = new Scope(false, List.of(20L), List.of(10L));
    private final LocalDate date = LocalDate.of(2026, 11, 2);

    @Test
    void historicalNominalQueryBindsDatesScopeAndEmployeeInOneBatch() throws Exception {
        repository.nominal(List.of(date, date.plusDays(1)), scope, 10L, 20L, 5L);

        var creator = ArgumentCaptor.forClass(PreparedStatementCreator.class);
        verify(jdbc).query(creator.capture(), any(RowMapper.class));
        String sql = ((SqlProvider) creator.getValue()).getSql();
        assertTrue(sql.contains("v.data_inicio <= dias.data_referencia"));
        assertTrue(sql.contains("v.data_fim >= dias.data_referencia"));
        assertTrue(sql.contains("p.data_referencia = dias.data_referencia"));
        assertTrue(sql.contains("ue.id IN (?)"));
        assertTrue(sql.contains("f.id = ?"));
        assertFalse(sql.contains("f.ativo ="));
        assertFalse(sql.contains(date.toString()));
        var connection = mock(Connection.class);
        var statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(sql)).thenReturn(statement);
        creator.getValue().createPreparedStatement(connection);
        verify(statement).setObject(1, java.sql.Date.valueOf(date));
        verify(statement).setObject(2, java.sql.Date.valueOf(date.plusDays(1)));
        verify(statement).setObject(3, 20L);
        verify(statement).setObject(4, 10L);
        verify(statement).setObject(5, 20L);
        verify(statement).setObject(6, 5L);
        verifyNoMoreInteractions(jdbc);
    }

    @Test
    void aggregationDeduplicatesPersonDayAndBoundsHistoricalLinksAtToday() {
        repository.aggregate(List.of(date, date.plusDays(1)), date, scope, null, null, 0);

        var creator = ArgumentCaptor.forClass(PreparedStatementCreator.class);
        verify(jdbc).query(creator.capture(), any(RowMapper.class));
        String sql = ((SqlProvider) creator.getValue()).getSql();
        assertTrue(sql.contains("COUNT(DISTINCT CONCAT(dias.data_referencia, ':', f.id))"));
        assertTrue(sql.contains("CASE WHEN p.id IS NOT NULL THEN CONCAT(dias.data_referencia, ':', f.id)"));
        assertTrue(sql.contains("dias.data_referencia <= ?"));
        assertTrue(sql.contains("v.data_inicio <= dias.data_referencia"));
        assertTrue(sql.contains("v.data_fim >= dias.data_referencia"));
        assertTrue(sql.contains("AND ue.id IN (?)"));
        assertFalse(sql.contains("f.ativo ="));
        assertFalse(sql.contains(date.toString()));
    }

    @Test
    void emptyTerritoryDoesNotReachJdbc() {
        var empty = new Scope(false, List.of(), List.of());
        assertTrue(repository.nominal(List.of(date), empty, null, null, null).isEmpty());
        assertTrue(repository.aggregate(List.of(date), date, empty, null, null, 0).isEmpty());
        assertFalse(repository.employeeVisible(5, empty, null, null));
        verifyNoInteractions(jdbc);
    }
}
