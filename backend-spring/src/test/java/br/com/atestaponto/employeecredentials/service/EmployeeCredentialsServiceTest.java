package br.com.atestaponto.employeecredentials.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest.EmployeeId;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository;
import com.fasterxml.jackson.databind.node.LongNode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class EmployeeCredentialsServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final EmployeeCredentialsRepository repository = new EmployeeCredentialsRepository(jdbc);
    private final EmployeeCredentialsService service = new EmployeeCredentialsService(repository);
    private final EmployeeId request = new EmployeeId(LongNode.valueOf(5));

    @ParameterizedTest
    @CsvSource({
        "2026-11-03T00:30:00Z, 2026-11-02",
        "2026-11-03T02:59:59Z, 2026-11-02",
        "2026-11-03T03:00:00Z, 2026-11-03"
    })
    void loginLinkAndLastLoginBindBrasiliaDateThroughRealRepository(String instant, LocalDate expected) {
        var brasilia = ZoneId.of("America/Sao_Paulo");
        var fixed = Clock.fixed(Instant.parse(instant), brasilia);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        try (var clocks = mockStatic(Clock.class, CALLS_REAL_METHODS)) {
            clocks.when(() -> Clock.system(brasilia)).thenReturn(fixed);

            assertNull(service.activeLink(request).vinculo());
            assertTrue(service.lastLogin(request).updated());

            clocks.verify(() -> Clock.system(brasilia), times(2));
        }

        verify(jdbc).query(anyString(), any(RowMapper.class), eq(5L), eq(expected.toString()), eq(expected.toString()));
        verify(jdbc).update(anyString(), eq(5L), eq(expected.toString()), eq(expected.toString()));
        verifyNoMoreInteractions(jdbc);
    }

    @ParameterizedTest
    @CsvSource({"2026-11-03T02:59:59Z, 2026-11-02", "2026-11-03T03:00:00Z, 2026-11-03"})
    void invalidLinkDoesNotReportSuccessfulLastLogin(String instant, LocalDate expected) {
        var brasilia = ZoneId.of("America/Sao_Paulo");
        var fixed = Clock.fixed(Instant.parse(instant), brasilia);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(0);

        try (var clocks = mockStatic(Clock.class, CALLS_REAL_METHODS)) {
            clocks.when(() -> Clock.system(brasilia)).thenReturn(fixed);

            var error = assertThrows(EmployeeCredentialsException.class, () -> service.lastLogin(request));
            assertEquals(401, error.status());
            assertEquals("UNAUTHORIZED", error.code());
            clocks.verify(() -> Clock.system(brasilia));
        }

        verify(jdbc).update(anyString(), eq(5L), eq(expected.toString()), eq(expected.toString()));
        verifyNoMoreInteractions(jdbc);
    }
}
