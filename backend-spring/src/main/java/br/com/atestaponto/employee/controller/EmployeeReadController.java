package br.com.atestaponto.employee.controller;

import br.com.atestaponto.employee.dto.EmployeeDetailRequest;
import br.com.atestaponto.employee.dto.EmployeeDetailResponse;
import br.com.atestaponto.employee.dto.EmployeeListRequest;
import br.com.atestaponto.employee.dto.EmployeeListResponse;
import br.com.atestaponto.service.EmployeeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/funcionarios")
public class EmployeeReadController {
    private final EmployeeService service;

    public EmployeeReadController(EmployeeService service) {
        this.service = service;
    }

    @PostMapping("/listagem")
    public EmployeeListResponse list(@Valid @RequestBody EmployeeListRequest request) {
        return service.list(request);
    }

    @PostMapping("/consultar")
    public EmployeeDetailResponse findAdminEmployeeById(@Valid @RequestBody EmployeeDetailRequest request) {
        return service.findAdminEmployeeById(request);
    }
}
