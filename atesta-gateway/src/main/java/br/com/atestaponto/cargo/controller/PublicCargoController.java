package br.com.atestaponto.cargo.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.cargo.service.PublicCargoService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/cargos")
public class PublicCargoController {
    private final PublicCargoService service;
    public PublicCargoController(PublicCargoService service) { this.service = service; }

    @GetMapping({"", "/"})
    public List<Map<String, Object>> list(@RequestAttribute("adminContext") AdminContextResponse admin) {
        return service.list(admin.admin().id());
    }
}
