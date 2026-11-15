package br.com.atestaponto.employeecredentials.repository;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse.ActiveLink;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class EmployeeCredentialsRepositoryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final EmployeeCredentialsRepository repository = new EmployeeCredentialsRepository(jdbc);
    private final LocalDate date = LocalDate.of(2026, 11, 2);

    @Test
    void loginLinkExcludesFutureStartsAndExpiredEndsWithInclusiveBoundaries() {
        repository.findActiveLink(5, date);

        var sql = ArgumentCaptor.forClass(String.class);
        var parameters = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), parameters.capture());
        assertTrue(sql.getValue().contains("v.funcionario_id = ? AND f.ativo = 1 AND v.status = 'ATIVO'"));
        assertTrue(sql.getValue().contains("v.data_inicio <= ? AND (v.data_fim IS NULL OR v.data_fim >= ?)"));
        assertTrue(sql.getValue().contains("ORDER BY v.id DESC LIMIT 1"));
        assertArrayEquals(new Object[]{5L, date.toString(), date.toString()}, parameters.getValue());
        assertFalse(sql.getValue().contains(date.toString()));
        assertFalse(sql.getValue().contains("CURRENT_DATE"));
        verifyNoMoreInteractions(jdbc);
    }

    @Test
    void invalidLoginLinkReturnsNull() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());

        assertNull(repository.findActiveLink(5, date));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void validLoginLinkMapsIds() throws Exception {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(call -> {
            var row = mock(ResultSet.class);
            when(row.getLong("id")).thenReturn(7L);
            when(row.getLong("unidade_escolar_id")).thenReturn(20L);
            RowMapper<ActiveLink> mapper = call.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        assertEquals(new ActiveLink(7, 20), repository.findActiveLink(5, date));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1})
    void lastLoginIsUpdatedOnlyWithAnActiveEmployeeAndCurrentlyValidLink(int affectedRows) {
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(affectedRows);

        assertEquals(affectedRows, repository.updateLastLogin(5, date));

        var sql = ArgumentCaptor.forClass(String.class);
        var parameters = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(sql.capture(), parameters.capture());
        assertTrue(sql.getValue().contains("SET lf.ultimo_login_em = CURRENT_TIMESTAMP"));
        assertTrue(sql.getValue().contains("lf.funcionario_id = ? AND f.ativo = 1 AND lf.primeiro_acesso = FALSE"));
        assertTrue(sql.getValue().contains("lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP"));
        assertTrue(sql.getValue().contains("AND EXISTS (SELECT 1 FROM vinculos_funcionais v"));
        assertTrue(sql.getValue().contains("v.funcionario_id = f.id AND v.status = 'ATIVO'"));
        assertTrue(sql.getValue().contains("v.data_inicio <= ? AND (v.data_fim IS NULL OR v.data_fim >= ?))"));
        assertArrayEquals(new Object[]{5L, date.toString(), date.toString()}, parameters.getValue());
        assertFalse(sql.getValue().contains(date.toString()));
        assertFalse(sql.getValue().contains("CURRENT_DATE"));
        verifyNoMoreInteractions(jdbc);
    }

    @Test
    void temporaryLoginRequiresExpiryEvenWhenMissingWhileRegularLoginRemainsValid() {
        repository.findLoginEmployee("12345678900", null);

        var sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), eq("12345678900"));
        assertTrue(sql.getValue().contains("(lf.primeiro_acesso = FALSE AND lf.senha_temporaria_expira_em IS NULL)"));
        assertTrue(sql.getValue().contains("OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP"));
    }

    @Test
    void credentialLockMapsVersionSourceAndDatabaseExpiryCheckTogether() throws Exception {
        var expiry = java.time.LocalDateTime.of(2026, 11, 10, 12, 0);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(call -> {
            var row = mock(ResultSet.class);
            when(row.getInt("ativo")).thenReturn(1);
            when(row.getInt("primeiro_acesso")).thenReturn(1);
            when(row.getString("senha_hash")).thenReturn("credential-hash");
            when(row.getObject("senha_temporaria_expira_em", java.time.LocalDateTime.class)).thenReturn(expiry);
            when(row.getBoolean("temporaria_valida")).thenReturn(true);
            RowMapper<EmployeeCredentialsRepository.Credential> mapper = call.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        var credential = repository.lockCredential(5);
        assertEquals(new EmployeeCredentialsRepository.Credential(true, true, "credential-hash", expiry, true), credential);
        assertEquals("Credential[redacted]", credential.toString());
        var sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), eq(5L));
        assertTrue(sql.getValue().contains("lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP AS temporaria_valida"));
        assertTrue(sql.getValue().endsWith(" FOR UPDATE"));
    }

    @Test
    void firstPasswordUpdateRechecksExpiryAtWriteAndResetDoesNotRequireTemporaryExpiry() {
        repository.updatePassword(5, "new-hash", true);
        repository.updatePassword(5, "reset-hash", false);

        var sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(sql.capture(), eq("new-hash"), eq(5L), eq(true));
        assertTrue(sql.getValue().contains("AND lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP"));
        verify(jdbc).update(sql.capture(), eq("reset-hash"), eq(5L), eq(false));
        assertFalse(sql.getValue().contains("AND lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP"));
    }
}
