package br.com.atestaponto.employee.repository;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

class EmployeeActivationRepositoryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final EmployeeActivationRepository repository = new EmployeeActivationRepository(jdbc);
    private final LocalDate date = LocalDate.of(2026, 11, 2);

    @Test
    void reactivationBindsDateAsLastParameter() {
        var link = new EmployeeActivationRepository.Link(7, 20, 3, "ENCERRADO", "PROFESSOR",
                "07:00:00", "11:00:00", "12:00:00", "16:00:00");
        repository.createLink(5, link, date);
        var sql = ArgumentCaptor.forClass(String.class);
        var parameters = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(sql.capture(), parameters.capture());
        assertTrue(sql.getValue().contains("VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')"));
        assertArrayEquals(new Object[]{5L, 20L, 3L, "07:00:00", "11:00:00", "12:00:00", "16:00:00", date}, parameters.getValue());
    }

    @Test
    void closureBindsDateAndLinkId() {
        repository.closeLink(7, date);
        verify(jdbc).update("UPDATE vinculos_funcionais SET status = 'ENCERRADO', data_fim = ? WHERE id = ?", date, 7L);
    }
}
