package br.com.atestaponto.report.service;

import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import br.com.atestaponto.report.dto.DailyReportResponse.EmployeeDay;
import br.com.atestaponto.report.dto.HierarchicalReportRequest;
import br.com.atestaponto.report.dto.HierarchicalReportResponse;
import br.com.atestaponto.report.dto.HierarchicalReportResponse.Department;
import br.com.atestaponto.report.dto.HierarchicalReportResponse.School;
import br.com.atestaponto.report.dto.WeeklyReportResponse.Summary;
import br.com.atestaponto.report.repository.DailyReportRepository.Row;
import br.com.atestaponto.report.repository.HierarchicalReportRepository;
import br.com.atestaponto.report.repository.HierarchicalReportRepository.Group;
import br.com.atestaponto.report.repository.PeriodReportRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PeriodReportService {
    private static final ZoneId BRASILIA = ZoneId.of("America/Sao_Paulo");
    private final PeriodReportRepository repository;
    private final HierarchicalReportRepository hierarchy;
    private final DailyReportService daily;
    private final Clock clock;

    @Autowired
    public PeriodReportService(PeriodReportRepository repository, HierarchicalReportRepository hierarchy,
            DailyReportService daily) {
        this(repository, hierarchy, daily, Clock.system(BRASILIA));
    }

    PeriodReportService(PeriodReportRepository repository, HierarchicalReportRepository hierarchy,
            DailyReportService daily, Clock clock) {
        this.repository = repository; this.hierarchy = hierarchy; this.daily = daily;
        this.clock = clock.withZone(BRASILIA);
    }

    public record Item(String data_referencia, boolean futuro, EmployeeDay ponto) {}
    public record Response(String data_referencia, String periodo, String data_inicio, String data_fim,
            String data_atual, Summary resumo, List<Item> items, List<Department> diretorias) {}

    @Transactional(readOnly = true)
    public Response report(String reference, String period, Scope scope, Long department,
            Long school, Long employee, String status, boolean aggregated) {
        LocalDate date = ReportDate.parse(reference);
        List<LocalDate> dates = dates(date, period);
        validateScope(scope);
        var request = new HierarchicalReportRequest(reference, scope.global(), scope.schools(), scope.departments(), department, school);
        if ((department != null && !hierarchy.departmentVisible(department, request))
                || (school != null && !hierarchy.schoolVisible(school, request))) throw denied();
        if (aggregated && (employee != null || status != null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filtros nominais indisponiveis no relatorio agregado");
        }
        if (status != null && !List.of("AUSENTE", "EM_ANDAMENTO", "COMPLETO").contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status de relatorio invalido");
        }
        if (employee != null && !repository.employeeVisible(employee, scope, department, school)) throw denied();
        LocalDate today = LocalDate.now(clock);
        if (aggregated) {
            var totals = repository.aggregate(dates, today, scope, department, school, 0);
            var departments = repository.aggregate(dates, today, scope, department, school, 1);
            var schools = repository.aggregate(dates, today, scope, department, school, 2);
            var total = totals.isEmpty() ? new Summary(0, 0, 0, 0) : summary(totals.getFirst());
            var items = departments.stream().map(de -> new Department(de.departmentId(), de.departmentName(), groupSummary(de),
                    schools.stream().filter(ue -> ue.departmentId().equals(de.departmentId()))
                            .map(ue -> new School(ue.schoolId(), ue.schoolName(), groupSummary(ue))).toList())).toList();
            return response(date, period, dates, today, total, List.of(), items);
        }
        // Uma consulta em lote; agrupa vinculo/data antes de aplicar os filtros de status.
        Map<String, List<Row>> grouped = new LinkedHashMap<>();
        Map<String, LocalDate> rowDates = new LinkedHashMap<>();
        for (var row : repository.nominal(dates, scope, department, school, employee)) {
            String key = row.row().linkId() + ":" + row.date();
            grouped.computeIfAbsent(key, ignored -> new ArrayList<>()).add(row.row());
            rowDates.put(key, row.date());
        }
        List<Item> items = grouped.entrySet().stream().map(entry -> {
            LocalDate day = rowDates.get(entry.getKey());
            return new Item(day.toString(), day.isAfter(today), daily.summarize(day, entry.getValue()));
        }).filter(item -> status == null || status.equals(item.ponto().status())).toList();
        var assessed = items.stream().filter(item -> !item.futuro()).toList();
        long expected = assessed.stream().map(item -> item.data_referencia() + ":" + item.ponto().funcionario().id()).distinct().count();
        long present = assessed.stream().filter(item -> item.ponto().total_batidas() > 0)
                .map(item -> item.data_referencia() + ":" + item.ponto().funcionario().id()).distinct().count();
        return response(date, period, dates, today, new Summary(expected, present, expected - present, percentage(present, expected)), items, List.of());
    }

    private Response response(LocalDate date, String period, List<LocalDate> dates, LocalDate today,
            Summary summary, List<Item> items, List<Department> departments) {
        return new Response(date.toString(), period, dates.getFirst().toString(), dates.getLast().toString(),
                today.toString(), summary, items, departments);
    }

    static List<LocalDate> dates(LocalDate date, String period) {
        LocalDate start;
        LocalDate end;
        switch (period) {
            case "dia" -> { start = date; end = date; }
            case "semana" -> { start = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)); end = start.plusDays(6); }
            case "mes" -> { start = date.withDayOfMonth(1); end = date.with(TemporalAdjusters.lastDayOfMonth()); }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Periodo invalido. Use dia, semana ou mes");
        }
        if (start.getYear() < 1000 || end.getYear() > 9999) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Periodo fora do intervalo suportado");
        }
        return start.datesUntil(end.plusDays(1)).toList();
    }

    private void validateScope(Scope scope) {
        if (scope == null || scope.schools() == null || scope.departments() == null
                || scope.schools().stream().anyMatch(id -> id == null || id <= 0)
                || scope.departments().stream().anyMatch(id -> id == null || id <= 0)
                || (!scope.global() && scope.schools().isEmpty() && scope.departments().isEmpty())
                || (scope.global() && (!scope.schools().isEmpty() || !scope.departments().isEmpty()))) throw denied();
    }

    private Summary summary(Group group) {
        return new Summary(group.totalEmployees(), group.presentEmployees(), group.totalEmployees() - group.presentEmployees(),
                percentage(group.presentEmployees(), group.totalEmployees()));
    }

    private HierarchicalReportResponse.Summary groupSummary(Group group) {
        return new HierarchicalReportResponse.Summary(group.totalEmployees(), group.totalEmployees(),
                group.presentEmployees(), group.totalEmployees() - group.presentEmployees(), percentage(group.presentEmployees(), group.totalEmployees()),
                group.totalLinks(), group.totalSchools(), group.totalDepartments());
    }

    private long percentage(long present, long total) { return total == 0 ? 0 : Math.round(100.0 * present / total); }
    private ResponseStatusException denied() { return new ResponseStatusException(HttpStatus.FORBIDDEN, "Recurso fora do escopo autorizado"); }
}
