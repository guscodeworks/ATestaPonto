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

    @PostMapping("/login")
    public EmployeeCredentialsResponse.Authentication login(@RequestBody EmployeeCredentialsRequest.Login request) {
        return service.login(request);
    }

    @PostMapping("/validacao-token")
    public EmployeeCredentialsResponse.Authentication tokenValidation(@RequestBody EmployeeCredentialsRequest.EmployeeId request) {
        return service.tokenValidation(request);
    }

    @PostMapping("/vinculo-ativo")
    public EmployeeCredentialsResponse.LoginLink activeLink(@RequestBody EmployeeCredentialsRequest.EmployeeId request) {
        return service.activeLink(request);
    }

    @PostMapping("/ultimo-login")
    public EmployeeCredentialsResponse.Change lastLogin(@RequestBody EmployeeCredentialsRequest.EmployeeId request) {
        return service.lastLogin(request);
    }

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
