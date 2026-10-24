package br.com.atestaponto.schoolqr.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.schoolqr.service.PublicSchoolQrService;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/qr-tokens")
public class PublicSchoolQrController {
    private final PublicSchoolQrService service;
    private final String baseUrl;

    // Origem configurada: Host e X-Forwarded-Proto do cliente nao definem o destino do QR.
    public PublicSchoolQrController(PublicSchoolQrService service, @Value("${APP_BASE_URL}") String appBaseUrl) {
        this.service = service;
        URI base = URI.create(appBaseUrl);
        if (base.getHost() == null || base.getUserInfo() != null
                || !("https".equals(base.getScheme()) || "http".equals(base.getScheme()))) {
            throw new IllegalArgumentException("APP_BASE_URL invalida");
        }
        baseUrl = base.resolve("/").toString();
    }

    @GetMapping({"", "/"})
    public Map<String, ?> current(@RequestAttribute("adminContext") AdminContextResponse admin) {
        return Map.of("success", true, "data", service.current(admin.admin().id(), baseUrl));
    }

    @PostMapping({"", "/"})
    public Map<String, ?> generate(@RequestAttribute("adminContext") AdminContextResponse admin, HttpServletRequest request) {
        return Map.of("success", true, "data", service.generate(admin.admin().id(), baseUrl, request.getRemoteAddr()));
    }
}
