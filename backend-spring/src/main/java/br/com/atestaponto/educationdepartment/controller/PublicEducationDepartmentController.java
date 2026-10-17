package br.com.atestaponto.educationdepartment.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.educationdepartment.service.PublicEducationDepartmentService;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/diretorias")
public class PublicEducationDepartmentController {
    private final PublicEducationDepartmentService service;
    public PublicEducationDepartmentController(PublicEducationDepartmentService service) { this.service = service; }

    @GetMapping({"", "/"})
    public Map<String, ?> list(@RequestAttribute("adminContext") AdminContextResponse admin,
            @RequestParam MultiValueMap<String, String> query) {
        return Map.of("success", true, "data", service.list(admin.admin().id(), query));
    }

    @PostMapping({"", "/"})
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, ?> create(@RequestAttribute("adminContext") AdminContextResponse admin, @RequestBody JsonNode body) {
        return Map.of("success", true, "data", service.create(admin.admin().id(), body));
    }

    @PutMapping({"/{id}", "/{id}/"})
    public Map<String, ?> update(@RequestAttribute("adminContext") AdminContextResponse admin,
            @PathVariable String id, @RequestBody JsonNode body) {
        return Map.of("success", true, "data", service.update(admin.admin().id(), id, body));
    }

    @PutMapping({"/{id}/status", "/{id}/status/"})
    public Map<String, ?> status(@RequestAttribute("adminContext") AdminContextResponse admin,
            @PathVariable String id, @RequestBody JsonNode body) {
        return Map.of("success", true, "data", service.status(admin.admin().id(), id, body));
    }
}
