package br.com.atestaponto.report.controller;

import br.com.atestaponto.report.dto.WeeklyReportRequest;
import br.com.atestaponto.report.dto.WeeklyReportResponse;
import br.com.atestaponto.report.service.WeeklyReportService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/relatorios")
public class WeeklyReportController {
    private final WeeklyReportService service;

    public WeeklyReportController(WeeklyReportService service) {
        this.service = service;
    }

    // O POST transporta o escopo assinado; consulta exclusivamente dados existentes.
    @PostMapping("/semanal")
    public WeeklyReportResponse report(@RequestBody WeeklyReportRequest request) {
        return service.report(request);
    }
}
