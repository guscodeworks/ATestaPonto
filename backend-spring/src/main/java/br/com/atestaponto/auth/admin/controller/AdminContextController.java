package br.com.atestaponto.auth.admin.controller;

import br.com.atestaponto.auth.admin.dto.AdminContextRequest;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.service.AdminContextService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/internal/auth/admin")
public class AdminContextController {
    private final AdminContextService service;

    public AdminContextController(AdminContextService service) {
        this.service = service;
    }

    @PostMapping("/context")
    public AdminContextResponse read(@RequestBody AdminContextRequest request) {
        // Rejeita o payload antes de abrir a transacao/conexao do service.
        if (request.admin_id() == null || request.admin_id() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador administrativo invalido");
        }
        return service.read(request.admin_id());
    }
}
