package br.com.atestaponto.auth.admin.controller;

import br.com.atestaponto.auth.admin.controller.PublicAdminAuthController.AdminPrincipal;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.AdminAccessPolicy;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PublicAdminSessionController {
    @GetMapping({"/api/admin/auth/me", "/api/admin/auth/me/"})
    public Map<String, ?> me(@AuthenticationPrincipal AdminPrincipal principal,
            @RequestAttribute("adminContext") AdminContextResponse context) {
        String loginAt = new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(principal.loginAt());
        return Map.of("success", true, "data", Map.of(
                "admin", Map.of("authProvider", "govbr", "id", principal.id(), "sub", principal.sub(),
                        "name", principal.name(), "nome", principal.name(), "email", principal.email(), "loginAt", loginAt),
                "capacidades", AdminAccessPolicy.list(context.acessos())));
    }
}
