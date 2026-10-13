package br.com.atestaponto.employeecredentials.controller;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest;
import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse;
import br.com.atestaponto.employeecredentials.service.EmployeeCredentialsService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/credenciais-funcionarios")
public class EmployeeCredentialsController {
    private final EmployeeCredentialsService service;

    public EmployeeCredentialsController(EmployeeCredentialsService service) { this.service = service; }

    @PostMapping("/recuperacao")
    public EmployeeCredentialsResponse.Recovery recovery(@RequestBody EmployeeCredentialsRequest.Recovery request) {
        return service.recovery(request);
    }

    @PostMapping("/primeiro-acesso")
    public EmployeeCredentialsResponse.Change firstAccess(@RequestBody EmployeeCredentialsRequest.Change request) {
        return service.firstAccess(request);
    }

    @PostMapping("/redefinir-senha")
    public EmployeeCredentialsResponse.Change resetPassword(@RequestBody EmployeeCredentialsRequest.Change request) {
        return service.resetPassword(request);
    }
}
