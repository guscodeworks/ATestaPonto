package br.com.atestaponto.school.controller;

import br.com.atestaponto.school.dto.SchoolListRequest;
import br.com.atestaponto.school.dto.SchoolListResponse;
import br.com.atestaponto.school.dto.SchoolResponse;
import br.com.atestaponto.school.service.SchoolService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/escolas")
public class SchoolController {

    private final SchoolService service;

    public SchoolController(SchoolService service) {
        this.service = service;
    }

    @PostMapping("/listagem")
    public SchoolListResponse listForAdmin(@Valid @RequestBody SchoolListRequest request) {
        return service.listForAdmin(request);
    }

    @GetMapping
    public List<SchoolResponse> listByEducationDepartment(
            @RequestParam("diretoria_ensino_id") Long educationDepartmentId) {
        return service.listByEducationDepartment(educationDepartmentId);
    }

    @GetMapping("/{id}")
    public SchoolResponse findById(@PathVariable("id") Integer id) {
        return service.findById(id);
    }
}
