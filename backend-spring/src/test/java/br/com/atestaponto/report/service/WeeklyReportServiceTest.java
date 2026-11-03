
package br.com.atestaponto.report.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.report.dto.WeeklyReportRequest;
import br.com.atestaponto.report.repository.WeeklyReportRepository;
import br.com.atestaponto.report.repository.WeeklyReportRepository.Row;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class WeeklyReportServiceTest {
    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

    private final WeeklyReportRepository repository = mock(WeeklyReportRepository.class);
    private final WeeklyReportService service = new WeeklyReportService(repository);

    @Test
    void buildsWeekFromMondayThroughSunday() {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate end = start.plusDays(6);

        when(repository.aggregate(anyList(), eq(true), eq(List.of())))
                .thenReturn(List.of());

        var response = service.report(new WeeklyReportRequest(today.toString(), true, List.of()));

        assertEquals(today.toString(), response.data_referencia());
        assertEquals(start.toString(), response.data_inicio());
        assertEquals(end.toString(), response.data_fim());
        assertEquals(today.toString(), response.data_atual());
        assertEquals(7, response.dias().size());

        for (int index = 0; index < 7; index++) {
            var day = response.dias().get(index);
            LocalDate expectedDate = start.plusDays(index);

            assertEquals(expectedDate.toString(), day.data());
            assertEquals(expectedDate.isAfter(today), day.futuro());
        }

        List<LocalDate> expectedQueryDates = start.datesUntil(today.plusDays(1)).toList();
        verify(repository).aggregate(expectedQueryDates, true, List.of());
    }

    @Test
    void calculatesWeeklyAndDailyTotalsAndPercentages() {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

        when(repository.aggregate(anyList(), eq(true), eq(List.of())))
                .thenReturn(List.of(new Row(start, 3, 2)));

        var response = service.report(new WeeklyReportRequest(today.toString(), true, List.of()));

        assertEquals(3, response.resumo().total_previstos());
        assertEquals(2, response.resumo().total_presencas());
        assertEquals(1, response.resumo().total_ausencias());
        assertEquals(67, response.resumo().taxa_presenca_percent());

        var firstDay = response.dias().getFirst();
        assertEquals(3, firstDay.resumo().total_funcionarios());
        assertEquals(3, firstDay.resumo().total_ativos());
        assertEquals(2, firstDay.resumo().presentes());
        assertEquals(1, firstDay.resumo().ausentes());
        assertEquals(67, firstDay.resumo().taxa_presenca_percent());

        var secondDay = response.dias().get(1);
        assertEquals(0, secondDay.resumo().total_funcionarios());
        assertEquals(0, secondDay.resumo().presentes());
        assertEquals(0, secondDay.resumo().taxa_presenca_percent());
    }

    @Test
    void returnsZeroTotalsWhenRepositoryHasNoRecords() {
        LocalDate today = LocalDate.now(ZONE);
        when(repository.aggregate(anyList(), eq(true), eq(List.of())))
                .thenReturn(List.of());

        var response = service.report(new WeeklyReportRequest(today.toString(), true, List.of()));

        assertEquals(0, response.resumo().total_previstos());
        assertEquals(0, response.resumo().total_presencas());
        assertEquals(0, response.resumo().total_ausencias());
        assertEquals(0, response.resumo().taxa_presenca_percent());

        assertEquals(7, response.dias().size());
        response.dias().forEach(day -> {
            assertEquals(0, day.resumo().total_funcionarios());
            assertEquals(0, day.resumo().presentes());
            assertEquals(0, day.resumo().ausentes());
            assertEquals(0, day.resumo().taxa_presenca_percent());
        });
    }

    @Test
    void doesNotQueryRepositoryForFutureDays() {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

        when(repository.aggregate(anyList(), eq(true), eq(List.of())))
                .thenReturn(List.of());

        var response = service.report(new WeeklyReportRequest(today.toString(), true, List.of()));

        List<LocalDate> expectedDates = start.datesUntil(today.plusDays(1)).toList();
        verify(repository).aggregate(expectedDates, true, List.of());

        response.dias().stream()
                .filter(day -> day.futuro())
                .forEach(day -> {
                    assertEquals(0, day.resumo().total_funcionarios());
                    assertEquals(0, day.resumo().presentes());
                });
    }

    @Test
    void removesDuplicateSchoolIdsBeforeRepositoryQuery() {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        List<LocalDate> dates = start.datesUntil(today.plusDays(1)).toList();

        when(repository.aggregate(anyList(), eq(false), eq(List.of(10L, 20L))))
                .thenReturn(List.of());

        service.report(new WeeklyReportRequest(today.toString(), false,
                List.of(10L, 20L, 10L, 20L)));

        verify(repository).aggregate(dates, false, List.of(10L, 20L));
    }

    @Test
    void acceptsValidTerritorialScope() {
        LocalDate today = LocalDate.now(ZONE);
        when(repository.aggregate(anyList(), eq(false), eq(List.of(10L))))
                .thenReturn(List.of());

        assertDoesNotThrow(() -> service.report(
                new WeeklyReportRequest(today.toString(), false, List.of(10L))));

        verify(repository).aggregate(anyList(), eq(false), eq(List.of(10L)));
    }

    @Test
    void acceptsEmptyTerritorialScopeWithoutResults() {
        LocalDate today = LocalDate.now(ZONE);

        when(repository.aggregate(anyList(), eq(false), eq(List.of())))
                .thenReturn(List.of());

        var response = service.report(
                new WeeklyReportRequest(today.toString(), false, List.of()));

        assertEquals(0, response.resumo().total_previstos());
        assertEquals(0, response.resumo().total_presencas());
        assertEquals(0, response.resumo().total_ausencias());

        verify(repository).aggregate(anyList(), eq(false), eq(List.of()));
    }

    @Test
    void rejectsInvalidScopesWithoutQueryingRepository() {
        LocalDate today = LocalDate.now(ZONE);

        List<WeeklyReportRequest> invalidRequests = Arrays.asList(
                new WeeklyReportRequest(today.toString(), null, List.of()),
                new WeeklyReportRequest(today.toString(), true, null),
                new WeeklyReportRequest(today.toString(), true, List.of(10L)),
                new WeeklyReportRequest(today.toString(), false, List.of(0L)),
                new WeeklyReportRequest(today.toString(), false, List.of(-1L)),
                new WeeklyReportRequest(today.toString(), false, Arrays.asList(10L, null)));

        for (WeeklyReportRequest request : invalidRequests) {
            var error = assertThrows(ResponseStatusException.class,
                    () -> service.report(request));
            assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        }

        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
        "",
        "03-11-2026",
        "2026-13-01",
        "2026-02-30",
        "20261103"
    })
    void rejectsInvalidDatesWithoutQueryingRepository(String date) {
        var error = assertThrows(ResponseStatusException.class,
                () -> service.report(new WeeklyReportRequest(date, true, List.of())));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0999-12-31", "9999-12-31"})
    void rejectsWeeksOutsideSupportedYearRange(String date) {
        var error = assertThrows(ResponseStatusException.class,
                () -> service.report(new WeeklyReportRequest(date, true, List.of())));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(repository);
    }
}
