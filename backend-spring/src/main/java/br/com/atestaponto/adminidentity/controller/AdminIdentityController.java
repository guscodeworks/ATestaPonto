package br.com.atestaponto.adminidentity.controller;

import br.com.atestaponto.adminidentity.dto.AdminIdentityResponse;
import br.com.atestaponto.adminidentity.service.AdminIdentityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/administrativos")
public class AdminIdentityController {
    private final AdminIdentityService service;

    public AdminIdentityController(AdminIdentityService service) {
        this.service = service;
    }

    @GetMapping("/{id}/contexto")
    public AdminIdentityResponse read(@PathVariable("id") long id) {
        return service.read(id);
    }
}
