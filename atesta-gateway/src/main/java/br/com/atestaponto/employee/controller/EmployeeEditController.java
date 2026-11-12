package br.com.atestaponto.employee.controller;

import br.com.atestaponto.employee.dto.EmployeeEditRequest;
import br.com.atestaponto.employee.dto.EmployeeEditResponse;
import br.com.atestaponto.employee.service.EmployeeEditService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/funcionarios")
public class EmployeeEditController {
    private final EmployeeEditService service;

    public EmployeeEditController(EmployeeEditService service) {
        this.service = service;
    }

    @PatchMapping("/{id}")
    public EmployeeEditResponse update(@PathVariable long id, @Valid @RequestBody EmployeeEditRequest request) {
        return service.update(id, request);
    }
}
