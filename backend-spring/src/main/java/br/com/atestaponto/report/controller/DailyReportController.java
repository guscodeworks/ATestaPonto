package br.com.atestaponto.report.controller;

import br.com.atestaponto.report.dto.DailyReportRequest;
import br.com.atestaponto.report.dto.DailyReportResponse;
import br.com.atestaponto.report.service.DailyReportService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/relatorios")
public class DailyReportController {
    private final DailyReportService service;

    public DailyReportController(DailyReportService service) {
        this.service = service;
    }

    // POST transporta o escopo no body assinado; executa apenas SELECT.
    @PostMapping("/diario")
    public DailyReportResponse snapshot(@RequestBody DailyReportRequest request) {
        return service.snapshot(request);
    }
}
