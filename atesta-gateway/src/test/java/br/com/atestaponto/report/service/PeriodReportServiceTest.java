package br.com.atestaponto.report.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import br.com.atestaponto.report.repository.DailyReportRepository;
import br.com.atestaponto.report.repository.DailyReportRepository.Row;
import br.com.atestaponto.report.repository.HierarchicalReportRepository;
import br.com.atestaponto.report.repository.HierarchicalReportRepository.Group;
import br.com.atestaponto.report.repository.PeriodReportRepository;
import br.com.atestaponto.report.repository.PeriodReportRepository.DatedRow;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PeriodReportServiceTest {
    private final PeriodReportRepository repository = mock(PeriodReportRepository.class);
    private final HierarchicalReportRepository hierarchy = mock(HierarchicalReportRepository.class);
    private final PeriodReportService service = new PeriodReportService(repository, hierarchy,
            new DailyReportService(mock(DailyReportRepository.class)),
            Clock.fixed(Instant.parse("2026-11-03T01:00:00Z"), ZoneOffset.UTC));
    private final Scope scope = new Scope(false, List.of(20L), List.of());

    @Test
    void civilMonthIncludesLeapDayAndWeekCrossesTheYearFromMondayToSunday() {
        var month = PeriodReportService.dates(LocalDate.of(2024, 2, 10), "mes");
        assertEquals(29, month.size());
        assertEquals(LocalDate.of(2024, 2, 1), month.getFirst());
        assertEquals(LocalDate.of(2024, 2, 29), month.getLast());
        var week = PeriodReportService.dates(LocalDate.of(2027, 1, 1), "semana");
        assertEquals(LocalDate.of(2026, 12, 28), week.getFirst());
        assertEquals(LocalDate.of(2027, 1, 3), week.getLast());
        assertEquals(7, week.size());
    }

    @Test
    void linkDateDetailCountsPeopleOncePerDayAndExcludesFutureDaysInBrasilia() {
        when(repository.nominal(any(), eq(scope), isNull(), isNull(), isNull())).thenReturn(List.of(
                dated("2026-11-02", 1, 5, 1L, "ENTRADA"),
                dated("2026-11-02", 1, 5, 2L, "SAIDA"),
                dated("2026-11-02", 2, 5, null, null),
                dated("2026-11-02", 3, 6, null, null),
                dated("2026-11-03", 1, 5, null, null)));

        var result = service.report("2026-11-02", "semana", scope, null, null, null, null, false);

        assertEquals("2026-11-02", result.data_atual());
        assertEquals(4, result.items().size());
        assertEquals(2, result.items().getFirst().ponto().total_batidas());
        assertFalse(result.items().getFirst().ponto().funcionario().ativo());
        assertEquals(2, result.resumo().total_previstos());
        assertEquals(1, result.resumo().total_presencas());
        assertEquals(1, result.resumo().total_ausencias());
        assertEquals(50, result.resumo().taxa_presenca_percent());
        assertTrue(result.items().getLast().futuro());
        verify(repository, times(1)).nominal(any(), eq(scope), isNull(), isNull(), isNull());
        verifyNoMoreInteractions(repository);
    }

    @Test
    void employeeAndStatusFiltersProduceTheSameFilteredRowsAndIndicators() {
        when(repository.employeeVisible(5, scope, null, null)).thenReturn(true);
        when(repository.nominal(any(), eq(scope), isNull(), isNull(), eq(5L))).thenReturn(List.of(
                dated("2026-11-01", 1, 5, null, null),
                dated("2026-11-02", 1, 5, 1L, "ENTRADA")));

        var result = service.report("2026-11-02", "mes", scope, null, null, 5L, "EM_ANDAMENTO", false);

        assertEquals(1, result.items().size());
        assertEquals("2026-11-02", result.items().getFirst().data_referencia());
        assertEquals(1, result.resumo().total_previstos());
        assertEquals(1, result.resumo().total_presencas());
        assertEquals(0, result.resumo().total_ausencias());
    }

    @Test
    void outsideEmployeeAndTerritorialFiltersFailBeforeDataQuery() {
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> service.report("2026-11-02", "dia", scope, null, null, 99L, null, false))
                .getStatusCode().value());
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> service.report("2026-11-02", "dia", scope, null, 99L, null, null, false))
                .getStatusCode().value());
        verify(repository, never()).nominal(any(), any(), any(), any(), any());
        verify(repository, never()).aggregate(any(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void emptyOrMissingScopeNeverExpandsAccess() {
        for (Scope invalid : new Scope[] { null, new Scope(false, List.of(), List.of()),
                new Scope(true, List.of(20L), List.of()) }) {
            assertEquals(403, assertThrows(ResponseStatusException.class,
                    () -> service.report("2026-11-02", "dia", invalid, null, null, null, null, false))
                    .getStatusCode().value());
        }
        verifyNoInteractions(repository, hierarchy);
    }

    @Test
    void aggregatedReportNeverLoadsNominalRowsOrAcceptsNominalFilters() {
        var global = new Scope(true, List.of(), List.of());
        when(repository.aggregate(any(), any(), eq(global), isNull(), isNull(), eq(0)))
                .thenReturn(List.of(new Group(null, null, null, null, 3, 2, 4, 1, 1)));
        when(repository.aggregate(any(), any(), eq(global), isNull(), isNull(), eq(1)))
                .thenReturn(List.of(new Group(10L, "Diretoria", null, null, 3, 2, 4, 1, 1)));
        when(repository.aggregate(any(), any(), eq(global), isNull(), isNull(), eq(2)))
                .thenReturn(List.of(new Group(10L, "Diretoria", 20L, "Escola", 3, 2, 4, 1, 1)));

        var result = service.report("2026-11-02", "mes", global, null, null, null, null, true);

        assertTrue(result.items().isEmpty());
        assertEquals(3, result.resumo().total_previstos());
        assertEquals(2, result.resumo().total_presencas());
        assertEquals(1, result.diretorias().size());
        assertEquals(1, result.diretorias().getFirst().escolas().size());
        verify(repository, times(3)).aggregate(any(), eq(LocalDate.of(2026, 11, 2)), eq(global), isNull(), isNull(), anyInt());
        verify(repository, never()).nominal(any(), any(), any(), any(), any());
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.report("2026-11-02", "mes", global, null, null, 5L, null, true)).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.report("2026-11-02", "mes", global, null, null, null, "AUSENTE", true)).getStatusCode().value());
    }

    @Test
    void invalidPeriodStatusAndCalendarDateAreRejected() {
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.report("2026-02-29", "dia", scope, null, null, null, null, false)).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.report("2026-11-02", "ano", scope, null, null, null, null, false)).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.report("2026-11-02", "dia", scope, null, null, null, "INVALIDO", false)).getStatusCode().value());
        verifyNoInteractions(repository);
    }

    private DatedRow dated(String date, long link, long employee, Long punch, String type) {
        return new DatedRow(LocalDate.parse(date), new Row(punch, link, employee, "Teste", "teste@example.test", null,
                false, 3L, 20L, "Escola", type, punch == null ? null : "08:00:00"));
    }
}
