package br.com.atestaponto.report.service;

import br.com.atestaponto.report.dto.DailyReportResponse;
import br.com.atestaponto.report.dto.WeeklyReportRequest;
import br.com.atestaponto.report.dto.WeeklyReportResponse;
import br.com.atestaponto.report.dto.WeeklyReportResponse.Day;
import br.com.atestaponto.report.dto.WeeklyReportResponse.Summary;
import br.com.atestaponto.report.repository.WeeklyReportRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.stream.IntStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WeeklyReportService {
    private final WeeklyReportRepository repository;

    public WeeklyReportService(WeeklyReportRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public WeeklyReportResponse report(WeeklyReportRequest request) {
        LocalDate date = ReportDate.parse(request.data());
        LocalDate start = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate end = start.plusDays(6);
        if (start.getYear() < 1000 || end.getYear() > 9999) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Semana fora do intervalo suportado");
        }
        if (request.escopo_global() == null || request.unidades_escolares_ids() == null
                || request.unidades_escolares_ids().stream().anyMatch(id -> id == null || id <= 0)
                || (request.escopo_global() && !request.unidades_escolares_ids().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escopo de relatorio invalido");
        }
        LocalDate today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
        List<LocalDate> dates = IntStream.range(0, 7).mapToObj(start::plusDays).toList();
        var rows = repository.aggregate(dates.stream().filter(day -> !day.isAfter(today)).toList(),
                request.escopo_global(), request.unidades_escolares_ids().stream().distinct().toList());
        List<Day> days = dates.stream().map(day -> {
            var row = rows.stream().filter(item -> item.date().equals(day)).findFirst();
            long total = row.map(WeeklyReportRepository.Row::totalEmployees).orElse(0L);
            long present = row.map(WeeklyReportRepository.Row::presentEmployees).orElse(0L);
            return new Day(day.toString(), day.isAfter(today), new DailyReportResponse.Summary(
                    total, total, present, total - present, percentage(present, total)));
        }).toList();
        List<Day> assessedDays = days.stream().filter(day -> !day.futuro()).toList();
        long expected = assessedDays.stream().mapToLong(day -> day.resumo().total_funcionarios()).sum();
        long present = assessedDays.stream().mapToLong(day -> day.resumo().presentes()).sum();
        long absent = assessedDays.stream().mapToLong(day -> day.resumo().ausentes()).sum();
        Summary summary = new Summary(expected, present, absent, percentage(present, expected));
        return new WeeklyReportResponse(date.toString(), start.toString(), end.toString(),
                today.toString(), summary, days);
    }

    private long percentage(long present, long total) {
        return total == 0 ? 0 : Math.round(100.0 * present / total);
    }
}
