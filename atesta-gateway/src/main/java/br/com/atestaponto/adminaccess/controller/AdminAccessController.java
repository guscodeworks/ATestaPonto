package br.com.atestaponto.adminaccess.controller;

import br.com.atestaponto.adminaccess.dto.AdminAccessRequest;
import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.*;
import br.com.atestaponto.adminaccess.service.AdminAccessService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/acessos-administrativos")
public class AdminAccessController {
    private final AdminAccessService service;
    public AdminAccessController(AdminAccessService service) { this.service = service; }

    @PostMapping("/listar")
    public Page list(@Valid @RequestBody AdminAccessRequest.ListQuery request) { return service.list(request); }
    @PostMapping("/consultar")
    public Lookup find(@Valid @RequestBody AdminAccessRequest.Id request) { return new Lookup(service.find(request.id())); }
    @PostMapping("/recurso")
    public Resource resource(@Valid @RequestBody AdminAccessRequest.ResourceQuery request) { return service.resource(request); }
    @PostMapping("/recursos")
    public Options options(@Valid @RequestBody AdminAccessRequest.Options request) { return service.options(request); }
    @PostMapping("/conceder")
    public Granted grant(@Valid @RequestBody AdminAccessRequest.Grant request) { return service.grant(request); }
    @PostMapping("/alterar-status")
    public Access change(@Valid @RequestBody AdminAccessRequest.Change request) { return service.change(request); }
}
