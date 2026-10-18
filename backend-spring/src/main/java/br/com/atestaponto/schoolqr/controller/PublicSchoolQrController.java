package br.com.atestaponto.schoolqr.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.schoolqr.service.PublicSchoolQrService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/qr-tokens")
public class PublicSchoolQrController {
    private final PublicSchoolQrService service;
    public PublicSchoolQrController(PublicSchoolQrService service) { this.service = service; }

    @GetMapping({"", "/"})
    public Map<String, ?> current(@RequestAttribute("adminContext") AdminContextResponse admin, HttpServletRequest request) {
        return Map.of("success", true, "data", service.current(admin.admin().id(), baseUrl(request)));
    }

    @PostMapping({"", "/"})
    public Map<String, ?> generate(@RequestAttribute("adminContext") AdminContextResponse admin, HttpServletRequest request) {
        return Map.of("success", true, "data", service.generate(admin.admin().id(), baseUrl(request), request.getRemoteAddr()));
    }

    private static String baseUrl(HttpServletRequest request) {
        String protocol = request.getHeader("X-Forwarded-Proto"), host = request.getHeader("Host");
        if (protocol == null || protocol.isEmpty()) protocol = request.getScheme();
        return host == null || host.isEmpty() ? "" : protocol + "://" + host;
    }
}
