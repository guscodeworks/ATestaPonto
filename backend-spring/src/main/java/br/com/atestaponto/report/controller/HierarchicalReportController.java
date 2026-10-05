package br.com.atestaponto.report.controller;

import br.com.atestaponto.report.dto.HierarchicalReportRequest;
import br.com.atestaponto.report.dto.HierarchicalReportResponse;
import br.com.atestaponto.report.service.HierarchicalReportService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/relatorios")
public class HierarchicalReportController {
    private final HierarchicalReportService service;

    public HierarchicalReportController(HierarchicalReportService service) {
        this.service = service;
    }

    @PostMapping("/hierarquia")
    public HierarchicalReportResponse report(@RequestBody HierarchicalReportRequest request) {
        return service.report(request);
    }
}
