package br.com.atestaponto.educationdepartment.controller;

import java.util.List;

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
}
