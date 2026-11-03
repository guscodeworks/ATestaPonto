package br.com.atestaponto.school.controller;

import br.com.atestaponto.school.dto.SchoolPreviewRequest;
import br.com.atestaponto.school.dto.SchoolPreviewResponse;
import br.com.atestaponto.school.service.SchoolService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/escolas")
public class SchoolPreviewController {

    private final SchoolService service;

    public SchoolPreviewController(SchoolService service) {
        this.service = service;
    }

    @PostMapping("/preview")
    public SchoolPreviewResponse preview(@Valid @RequestBody SchoolPreviewRequest request) {
        return service.preview(request);
    }
}
