package br.com.atestaponto.report.service;

import br.com.atestaponto.report.dto.DailyReportRequest;
import br.com.atestaponto.report.dto.DailyReportResponse;
import br.com.atestaponto.report.dto.DailyReportResponse.*;
import br.com.atestaponto.report.repository.DailyReportRepository;
import br.com.atestaponto.report.repository.DailyReportRepository.Row;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DailyReportService {
    private static final Map<String, Integer> SEQUENCES = Map.of(
            "ENTRADA", 1, "SAIDA_ALMOCO", 2, "RETORNO_ALMOCO", 3, "SAIDA", 4);
    private final DailyReportRepository repository;

    public DailyReportService(DailyReportRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public DailyReportResponse snapshot(DailyReportRequest request) {
        LocalDate date = ReportDate.parse(request.data());
        // Campo ausente nunca equivale a escopo global.
        if (request.escopo_global() == null || request.unidades_escolares_ids() == null
                || request.unidades_escolares_ids().stream().anyMatch(id -> id == null || id <= 0)
                || (request.escopo_global() && !request.unidades_escolares_ids().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escopo de relatorio invalido");
        }
        List<Long> schools = request.unidades_escolares_ids().stream().distinct().toList();
        Map<Long, List<Row>> grouped = new LinkedHashMap<>();
        for (Row row : repository.findByDate(date, request.escopo_global(), schools)) {
            grouped.computeIfAbsent(row.linkId(), ignored -> new ArrayList<>()).add(row);
        }
        List<EmployeeDay> days = grouped.values().stream().map(rows -> summarize(date, rows)).toList();
        List<EmployeeDay> present = days.stream().filter(day -> day.total_batidas() > 0).toList();
        List<EmployeeDay> absent = days.stream().filter(day -> day.total_batidas() == 0).toList();
        // Indicadores sao por pessoa; linhas continuam por vinculo.
        long total = days.stream().map(day -> day.funcionario().id()).distinct().count();
        long presentCount = present.stream().map(day -> day.funcionario().id()).distinct().count();
        Summary summary = new Summary(total, total, presentCount, total - presentCount,
                total == 0 ? 0 : Math.round(100.0 * presentCount / total));
        return new DailyReportResponse(date.toString(), total, total, present, absent, days, summary);
    }

    private EmployeeDay summarize(LocalDate date, List<Row> rows) {
        Row first = rows.getFirst();
        List<Punch> punches = rows.stream()
                .filter(row -> row.punchId() != null && SEQUENCES.containsKey(row.type()))
                .map(row -> new Punch(row.punchId(), row.type(), SEQUENCES.get(row.type()),
                        date + " " + (row.time() == null ? "00:00:00" : row.time())))
                .sorted(Comparator.comparingInt(Punch::sequencia)).toList();
        Object entry = time(date, rows, "ENTRADA");
        Object exit = time(date, rows, "SAIDA");
        String cpf = first.cpf() == null ? "" : first.cpf().replaceAll("\\D", "");
        String maskedCpf = cpf.length() == 11 ? "***.***.***-" + cpf.substring(9) : "***.***.***-**";
        Employee employee = new Employee(first.employeeId(), first.name(), first.email(), maskedCpf,
                first.active(), first.jobId());
        String status = punches.isEmpty() ? "AUSENTE" : exit instanceof String ? "COMPLETO" : "EM_ANDAMENTO";
        return new EmployeeDay(first.linkId() + "-" + date, first.linkId(), first.schoolId(),
                first.schoolName(), employee, status, punches.size(), entry, exit, punches);
    }

    private Object time(LocalDate date, List<Row> rows, String type) {
        String time = null;
        for (Row row : rows) {
            if (type.equals(row.type()) && row.time() != null) time = row.time();
        }
        return time == null || "00:00:00".equals(time) ? Map.of() : date + " " + time;
    }
}
