package br.com.atestaponto.report.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import br.com.atestaponto.report.service.PublicReportService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/pontos")
public class PublicReportController {
    private final PublicReportService service;
    public PublicReportController(PublicReportService service) { this.service = service; }

    @GetMapping({"/hoje", "/hoje/", "/relatorio", "/relatorio/", "/relatorio/semanal", "/relatorio/semanal/",
            "/relatorio/hierarquia", "/relatorio/hierarquia/", "/resumo", "/resumo/"})
    public Map<String, ?> read(@RequestAttribute("adminContext") AdminContextResponse admin,
            @RequestAttribute("reportScope") Scope scope, @RequestParam MultiValueMap<String, String> query,
            HttpServletRequest request) {
        String report = request.getServletPath().substring("/api/admin/pontos/".length()).replaceAll("/$", "");
        // RemoteIpValve (forward-headers-strategy=native) ja resolve X-Forwarded-For apenas de proxies internos.
        String ip = request.getRemoteAddr();
        return Map.of("success", true, "data", service.read(report, query, scope, admin.admin().id(), ip));
    }
}
