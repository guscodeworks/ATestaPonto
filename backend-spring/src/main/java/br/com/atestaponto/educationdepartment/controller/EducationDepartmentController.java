package br.com.atestaponto.educationdepartment.controller;

import java.util.List;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import br.com.atestaponto.educationdepartment.dto.EducationDepartmentRequest;
import br.com.atestaponto.educationdepartment.dto.EducationDepartmentStatusRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.com.atestaponto.educationdepartment.dto.EducationDepartmentResponse;
import br.com.atestaponto.educationdepartment.service.EducationDepartmentService;

@RestController
@RequestMapping("/internal/diretorias")
public class EducationDepartmentController {

    private final EducationDepartmentService service;

    public EducationDepartmentController(EducationDepartmentService service) {
        this.service = service;
    }

    @GetMapping
    public List<EducationDepartmentResponse> list(
            @RequestParam(required = false) Boolean ativo) {

        return service.list(ativo);
    }

    @GetMapping("/{id}")
    public EducationDepartmentResponse findById(
            @PathVariable("id") Long id) {

        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EducationDepartmentResponse create(@Valid @RequestBody EducationDepartmentRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public EducationDepartmentResponse update(@PathVariable("id") Long id,
            @Valid @RequestBody EducationDepartmentRequest request) {
        return service.update(id, request);
    }

    @PutMapping("/{id}/status")
    public EducationDepartmentResponse changeStatus(@PathVariable("id") Long id,
            @Valid @RequestBody EducationDepartmentStatusRequest request) {
        return service.changeStatus(id, request.ativo());
    }
}
