package br.com.atestaponto.employee.controller;

import br.com.atestaponto.employee.dto.EmployeeActivationRequest;
import br.com.atestaponto.employee.dto.EmployeeActivationResponse;
import br.com.atestaponto.employee.service.EmployeeActivationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/funcionarios")
public class EmployeeActivationController {
    private final EmployeeActivationService service;

    public EmployeeActivationController(EmployeeActivationService service) {
        this.service = service;
    }

    @PatchMapping("/{id}/desativar")
    public EmployeeActivationResponse deactivate(@PathVariable long id,
            @Valid @RequestBody EmployeeActivationRequest request) {
        return service.changeActivation(id, false, request);
    }

    @PatchMapping("/{id}/reativar")
    public EmployeeActivationResponse reactivate(@PathVariable long id,
            @Valid @RequestBody EmployeeActivationRequest request) {
        return service.changeActivation(id, true, request);
    }
}
