package br.com.atestaponto.report.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.server.ResponseStatusException;

class PublicReportServiceTest {
    private final PeriodReportService period = mock(PeriodReportService.class);
    private final PublicReportService service = new PublicReportService(mock(DailyReportService.class),
            mock(WeeklyReportService.class), mock(HierarchicalReportService.class), period);
    private final Scope scope = new Scope(false, List.of(20L), List.of());

    @Test
    void periodForwardsAuthorizedScopeAndAllFilters() {
        var query = query();
        query.add("periodo", "mes");
        query.add("funcionario_id", "5");
        query.add("unidade_escolar_id", "20");
        query.add("diretoria_ensino_id", "10");
        query.add("status", "AUSENTE");

        service.read("relatorio/periodo", query, scope, 7, "127.0.0.1");

        verify(period).report("2026-11-02", "mes", scope, 10L, 20L, 5L, "AUSENTE", false);
    }

    @Test
    void hierarchySelectsAggregateServiceModeAndDefaultsToOneDay() {
        service.read("relatorio/hierarquia/periodo", query(), scope, 7, "127.0.0.1");
        verify(period).report("2026-11-02", "dia", scope, null, null, null, null, true);
    }

    @Test
    void repeatedArrayAndUnsafeFiltersAreRejectedBeforeDomainRead() {
        for (String field : List.of("periodo", "data", "funcionario_id", "status", "unidade_escolar_id", "diretoria_ensino_id")) {
            var repeated = query();
            repeated.add(field, "1");
            repeated.add(field, "2");
            assertBadRequest(repeated);
            var array = query();
            array.add(field + "[]", "1");
            assertBadRequest(array);
        }
        for (String id : List.of("0", "-1", "1.1", "9007199254740992", "1 OR 1=1")) {
            var invalid = query();
            invalid.add("funcionario_id", id);
            assertBadRequest(invalid);
        }
        verifyNoInteractions(period);
    }

    private void assertBadRequest(LinkedMultiValueMap<String, String> query) {
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.read("relatorio/periodo", query, scope, 7, "127.0.0.1")).getStatusCode().value());
    }

    private LinkedMultiValueMap<String, String> query() {
        var query = new LinkedMultiValueMap<String, String>();
        query.add("data", "2026-11-02");
        return query;
    }
}
