package br.com.atestaponto.employee.controller;

import br.com.atestaponto.employee.dto.EmployeeCreateRequest;
import br.com.atestaponto.employee.dto.EmployeeCreateResponse;
import br.com.atestaponto.employee.service.EmployeeCreateService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/funcionarios")
public class EmployeeCreateController {
    private final EmployeeCreateService service;

    public EmployeeCreateController(EmployeeCreateService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EmployeeCreateResponse create(@Valid @RequestBody EmployeeCreateRequest request) {
        return service.create(request);
    }
}
