package br.com.atestaponto.report.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.com.atestaponto.report.dto.DailyReportRequest;
import br.com.atestaponto.report.repository.DailyReportRepository;
import br.com.atestaponto.report.repository.DailyReportRepository.Row;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class DailyReportServiceTest {
    private static final LocalDate DATE = LocalDate.of(2026, 11, 2);
    private final DailyReportRepository repository = mock(DailyReportRepository.class);
    private final DailyReportService service = new DailyReportService(repository);

    @ParameterizedTest
    @CsvSource(value = {
        "00:00:00,NULL,EM_ANDAMENTO",
        "08:00:00,NULL,EM_ANDAMENTO",
        "00:00:00,09:00:00,COMPLETO",
        "08:00:00,00:00:00,COMPLETO",
        "08:00:00,17:00:00,COMPLETO"
    }, nullValues = "NULL")
    void preservesPunchTimesAndDayStatus(String entry, String exit, String status) {
        var rows = new ArrayList<Row>();
        rows.add(row(1L, "ENTRADA", entry));
        if (exit != null) {
            rows.add(row(2L, "SAIDA_ALMOCO", "12:00:00"));
            rows.add(row(3L, "RETORNO_ALMOCO", "13:00:00"));
            rows.add(row(4L, "SAIDA", exit));
        }
        when(repository.findByDate(DATE, true, List.of())).thenReturn(rows);

        var response = service.snapshot(new DailyReportRequest(DATE.toString(), true, List.of()));
        var day = response.relatorio().getFirst();

        assertEquals(DATE + " " + entry, day.entrada());
        assertEquals(exit == null ? Map.of() : DATE + " " + exit, day.saida());
        assertEquals(status, day.status());
        assertEquals(rows.size(), day.total_batidas());
        assertEquals(rows.stream().map(row -> DATE + " " + row.time()).toList(),
                day.registros().stream().map(punch -> punch.registrado_em()).toList());
        assertEquals(List.of(day), response.presentes());
        assertTrue(response.ausentes().isEmpty());
        assertEquals(1, response.resumo().presentes());
        assertEquals(0, response.resumo().ausentes());
        var json = new ObjectMapper().valueToTree(day);
        assertEquals(DATE + " " + entry, json.path("entrada").asText());
        if (exit == null) assertEquals(new ObjectMapper().createObjectNode(), json.path("saida"));
        else assertEquals(DATE + " " + exit, json.path("saida").asText());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"ENTRADA", "SAIDA"})
    void missingPunchIdRemainsAbsent(String type) {
        when(repository.findByDate(DATE, true, List.of()))
                .thenReturn(List.of(row(null, type, type == null ? null : "00:00:00")));

        var response = service.snapshot(new DailyReportRequest(DATE.toString(), true, List.of()));
        var day = response.relatorio().getFirst();

        assertEquals(Map.of(), day.entrada());
        assertEquals(Map.of(), day.saida());
        assertEquals("AUSENTE", day.status());
        assertEquals(0, day.total_batidas());
        assertTrue(day.registros().isEmpty());
        assertTrue(response.presentes().isEmpty());
        assertEquals(List.of(day), response.ausentes());
        assertEquals(0, response.resumo().presentes());
        assertEquals(1, response.resumo().ausentes());
        var json = new ObjectMapper().valueToTree(day);
        assertEquals(new ObjectMapper().createObjectNode(), json.path("entrada"));
        assertEquals(new ObjectMapper().createObjectNode(), json.path("saida"));
    }


    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "02-11-2026", "2026-13-01", "2026-02-30", "20261102"})
    void rejectsInvalidDatesWithoutQueryingRepository(String date) {
        var error = assertThrows(ResponseStatusException.class,
                () -> service.snapshot(new DailyReportRequest(date, true, List.of())));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(repository);
    }

    @Test
    void rejectsInvalidScopesWithoutQueryingRepository() {
        var invalidRequests = List.of(
                new DailyReportRequest(DATE.toString(), null, List.of()),
                new DailyReportRequest(DATE.toString(), true, null),
                new DailyReportRequest(DATE.toString(), false, null),
                new DailyReportRequest(DATE.toString(), true, List.of(20L)),
                new DailyReportRequest(DATE.toString(), false, List.of(0L)),
                new DailyReportRequest(DATE.toString(), false, List.of(-1L)),
                new DailyReportRequest(DATE.toString(), false,
                        java.util.Arrays.asList(20L, null)));

        for (var request : invalidRequests) {
            var error = assertThrows(ResponseStatusException.class,
                    () -> service.snapshot(request));
            assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        }

        verifyNoInteractions(repository);
    }

    @Test
    void removesDuplicateSchoolIdsBeforeQueryingRepository() {
        when(repository.findByDate(DATE, false, List.of(20L)))
                .thenReturn(List.of());

        service.snapshot(new DailyReportRequest(
                DATE.toString(), false, List.of(20L, 20L)));

        verify(repository).findByDate(DATE, false, List.of(20L));
    }

    @Test
    void sortsPunchesByBusinessSequenceRegardlessOfRepositoryOrder() {
        when(repository.findByDate(DATE, true, List.of())).thenReturn(List.of(
                row(4L, "SAIDA", "17:00:00"),
                row(2L, "SAIDA_ALMOCO", "12:00:00"),
                row(1L, "ENTRADA", "08:00:00"),
                row(3L, "RETORNO_ALMOCO", "13:00:00")));

        var day = service.snapshot(
                new DailyReportRequest(DATE.toString(), true, List.of()))
                .relatorio().getFirst();

        assertEquals(
                List.of("ENTRADA", "SAIDA_ALMOCO", "RETORNO_ALMOCO", "SAIDA"),
                day.registros().stream().map(punch -> punch.tipo()).toList());

        assertEquals(List.of(1, 2, 3, 4),
                day.registros().stream().map(punch -> punch.sequencia()).toList());
    }

    @Test
    void masksCpfAndPreservesOnlyLastTwoDigits() {
        Row source = new Row(1L, 7L, 5L, "Teste", "teste@example.test",
                "123.456.789-01", true, 3L, 20L, "Unidade teste",
                "ENTRADA", "08:00:00");

        when(repository.findByDate(DATE, true, List.of()))
                .thenReturn(List.of(source));

        var employee = service.snapshot(
                new DailyReportRequest(DATE.toString(), true, List.of()))
                .relatorio().getFirst().funcionario();

        assertEquals("***.***.***-01", employee.cpf());
    }

    @Test
    void masksMissingOrMalformedCpfCompletely() {
        for (String cpf : List.of("", "12345", "123456789012")) {
            Row source = new Row(1L, 7L, 5L, "Teste", "teste@example.test",
                    cpf, true, 3L, 20L, "Unidade teste",
                    "ENTRADA", "08:00:00");

            when(repository.findByDate(DATE, true, List.of()))
                    .thenReturn(List.of(source));

            var employee = service.snapshot(
                    new DailyReportRequest(DATE.toString(), true, List.of()))
                    .relatorio().getFirst().funcionario();

            assertEquals("***.***.***-**", employee.cpf());
        }
    }

    @Test
    void countsEmployeeWithMultipleLinksOnlyOnceInSummary() {
        Row presentLink = new Row(1L, 7L, 5L, "Teste", "teste@example.test",
                "12345678901", true, 3L, 20L, "Unidade A",
                "ENTRADA", "08:00:00");

        Row absentLink = new Row(null, 8L, 5L, "Teste", "teste@example.test",
                "12345678901", true, 4L, 21L, "Unidade B",
                null, null);

        when(repository.findByDate(DATE, true, List.of()))
                .thenReturn(List.of(presentLink, absentLink));

        var response = service.snapshot(
                new DailyReportRequest(DATE.toString(), true, List.of()));

        // O relat?rio continua detalhado por v?nculo.
        assertEquals(2, response.relatorio().size());
        assertEquals(1, response.presentes().size());
        assertEquals(1, response.ausentes().size());

        // Os indicadores contam pessoas, n?o v?nculos.
        assertEquals(1, response.total_funcionarios());
        assertEquals(1, response.resumo().total_funcionarios());
        assertEquals(1, response.resumo().presentes());
        assertEquals(0, response.resumo().ausentes());
        assertEquals(100, response.resumo().taxa_presenca_percent());
    }

    @Test
    void countsEmployeeWithMultipleAbsentLinksOnlyOnce() {
        Row firstLink = new Row(null, 7L, 5L, "Teste", "teste@example.test",
                "12345678901", true, 3L, 20L, "Unidade A", null, null);

        Row secondLink = new Row(null, 8L, 5L, "Teste", "teste@example.test",
                "12345678901", true, 4L, 21L, "Unidade B", null, null);

        when(repository.findByDate(DATE, true, List.of()))
                .thenReturn(List.of(firstLink, secondLink));

        var response = service.snapshot(
                new DailyReportRequest(DATE.toString(), true, List.of()));

        assertEquals(2, response.relatorio().size());
        assertEquals(2, response.ausentes().size());
        assertEquals(1, response.total_funcionarios());
        assertEquals(1, response.resumo().total_funcionarios());
        assertEquals(0, response.resumo().presentes());
        assertEquals(1, response.resumo().ausentes());
        assertEquals(0, response.resumo().taxa_presenca_percent());
    }
    private Row row(Long id, String type, String time) {
        return new Row(id, 7L, 5L, "Teste", "teste@example.test", null, true,
                3L, 20L, "Unidade teste", type, time);
    }
}
