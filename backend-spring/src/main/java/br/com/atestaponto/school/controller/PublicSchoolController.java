package br.com.atestaponto.school.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.school.service.PublicSchoolService;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/escolas")
public class PublicSchoolController {
    private final PublicSchoolService service;
    public PublicSchoolController(PublicSchoolService service) { this.service = service; }

    @GetMapping({"", "/"})
    public Map<String, ?> list(@RequestAttribute("adminContext") AdminContextResponse admin,
            @RequestParam MultiValueMap<String, String> query) {
        return Map.of("success", true, "data", service.list(admin.admin().id(), query));
    }

    @GetMapping({"/diretorias", "/diretorias/"})
    public Map<String, ?> departments(@RequestAttribute("adminContext") AdminContextResponse admin) {
        return Map.of("success", true, "data", service.registrationDepartments(admin.admin().id()));
    }

    @GetMapping({"/cep/{cep}", "/cep/{cep}/"})
    public Map<String, ?> cep(@RequestAttribute("adminContext") AdminContextResponse admin, @PathVariable String cep) {
        return Map.of("success", true, "data", service.cep(admin.admin().id(), cep));
    }

    @GetMapping({"/{id}", "/{id}/"})
    public Map<String, ?> find(@RequestAttribute("adminContext") AdminContextResponse admin, @PathVariable String id) {
        return Map.of("success", true, "data", service.find(admin.admin().id(), id));
    }

    @PostMapping({"/preview", "/preview/"})
    public Object preview(@RequestAttribute("adminContext") AdminContextResponse admin, @RequestBody JsonNode body) {
        return service.preview(admin.admin().id(), body);
    }

    @PostMapping({"", "/"})
    @ResponseStatus(HttpStatus.CREATED)
    public Object create(@RequestAttribute("adminContext") AdminContextResponse admin, @RequestBody JsonNode body) {
        return service.create(admin.admin().id(), body);
    }
}
