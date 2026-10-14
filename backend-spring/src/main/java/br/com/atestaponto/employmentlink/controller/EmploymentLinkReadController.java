package br.com.atestaponto.employmentlink.controller;

import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import br.com.atestaponto.employmentlink.service.EmploymentLinkReadService;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/vinculos-funcionais/funcionarios/{funcionarioId}")
public class EmploymentLinkReadController {
    private final EmploymentLinkReadService service;

    public EmploymentLinkReadController(EmploymentLinkReadService service) {
        this.service = service;
    }

    @GetMapping("/ativo")
    public ResponseEntity<EmploymentLinkScopeResponse> findActive(@PathVariable("funcionarioId") Long funcionarioId) {
        return response(service.findActiveByEmployeeId(funcionarioId));
    }

    @GetMapping("/visivel")
    public ResponseEntity<EmploymentLinkScopeResponse> findVisibleForAdmin(@PathVariable("funcionarioId") Long funcionarioId) {
        return response(service.findVisibleForAdminByEmployeeId(funcionarioId));
    }

    @GetMapping("/mais-recente")
    public ResponseEntity<EmploymentLinkScopeResponse> findLatest(@PathVariable("funcionarioId") Long funcionarioId) {
        return response(service.findLatestByEmployeeId(funcionarioId));
    }

    private ResponseEntity<EmploymentLinkScopeResponse> response(Optional<EmploymentLinkScopeResponse> row) {
        return row.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
