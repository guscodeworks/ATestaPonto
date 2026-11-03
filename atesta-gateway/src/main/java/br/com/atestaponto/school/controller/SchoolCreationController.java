package br.com.atestaponto.school.controller;

import br.com.atestaponto.school.dto.SchoolPreviewRequest;
import br.com.atestaponto.school.dto.SchoolResponse;
import br.com.atestaponto.school.service.SchoolService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/escolas")
public class SchoolCreationController {

    private final SchoolService service;

    public SchoolCreationController(SchoolService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SchoolResponse create(@Valid @RequestBody SchoolPreviewRequest request) {
        return service.create(request);
    }
}
