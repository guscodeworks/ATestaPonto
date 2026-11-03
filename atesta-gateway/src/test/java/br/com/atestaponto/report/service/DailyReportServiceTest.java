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

    private Row row(Long id, String type, String time) {
        return new Row(id, 7L, 5L, "Teste", "teste@example.test", null, true,
                3L, 20L, "Unidade teste", type, time);
    }
}
