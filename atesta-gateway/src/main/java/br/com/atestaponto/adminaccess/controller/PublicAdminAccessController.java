package br.com.atestaponto.adminaccess.controller;

import br.com.atestaponto.adminaccess.service.PublicAdminAccessService;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/acessos")
public class PublicAdminAccessController {
    private final PublicAdminAccessService service;
    public PublicAdminAccessController(PublicAdminAccessService service) { this.service = service; }

    @GetMapping({"", "/"})
    public Map<String, ?> list(@RequestAttribute("adminContext") AdminContextResponse admin,
            @RequestParam MultiValueMap<String, String> query) {
        return response(service.list(admin.admin().id(), query));
    }

    @GetMapping({"/meu", "/meu/"})
    public Map<String, ?> own(@RequestAttribute("adminContext") AdminContextResponse admin) {
        return response(service.own(admin.admin().id()));
    }

    @GetMapping({"/capacidades", "/capacidades/"})
    public Map<String, ?> capabilities(@RequestAttribute("adminContext") AdminContextResponse admin) {
        return response(service.capabilities(admin.admin().id()));
    }

    @GetMapping({"/opcoes-concessao", "/opcoes-concessao/"})
    public Map<String, ?> options(@RequestAttribute("adminContext") AdminContextResponse admin) {
        return response(service.options(admin.admin().id()));
    }

    @GetMapping({"/{id}", "/{id}/"})
    public Map<String, ?> find(@RequestAttribute("adminContext") AdminContextResponse admin, @PathVariable String id) {
        return response(service.find(admin.admin().id(), id));
    }

    @PostMapping({"", "/"})
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, ?> grant(@RequestAttribute("adminContext") AdminContextResponse admin,
            @RequestAttribute(value = "publicAccessBody", required = false) JsonNode body, HttpServletRequest request) {
        return response(service.grant(admin.admin().id(), body, request.getRemoteAddr()));
    }

    @PatchMapping({"/{id}/suspender", "/{id}/suspender/"})
    public Map<String, ?> suspend(@RequestAttribute("adminContext") AdminContextResponse admin,
            @PathVariable String id, HttpServletRequest request) {
        return response(service.change(admin.admin().id(), id, "suspender", request.getRemoteAddr()));
    }

    @PatchMapping({"/{id}/reativar", "/{id}/reativar/"})
    public Map<String, ?> reactivate(@RequestAttribute("adminContext") AdminContextResponse admin,
            @PathVariable String id, HttpServletRequest request) {
        return response(service.change(admin.admin().id(), id, "reativar", request.getRemoteAddr()));
    }

    @PatchMapping({"/{id}/revogar", "/{id}/revogar/"})
    public Map<String, ?> revoke(@RequestAttribute("adminContext") AdminContextResponse admin,
            @PathVariable String id, HttpServletRequest request) {
        return response(service.change(admin.admin().id(), id, "revogar", request.getRemoteAddr()));
    }

    private static Map<String, ?> response(Object data) { return Map.of("success", true, "data", data); }
}
