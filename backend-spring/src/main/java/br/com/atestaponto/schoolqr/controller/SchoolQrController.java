package br.com.atestaponto.schoolqr.controller;

import br.com.atestaponto.schoolqr.dto.SchoolQrRequest;
import br.com.atestaponto.schoolqr.dto.SchoolQrResponse;
import br.com.atestaponto.schoolqr.service.SchoolQrService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/escolas/qr")
public class SchoolQrController {
    private final SchoolQrService service;
    public SchoolQrController(SchoolQrService service) { this.service = service; }

    @PostMapping({"/gerar", "/regenerar"})
    public SchoolQrResponse.Current generate(@RequestBody SchoolQrRequest request) {
        return new SchoolQrResponse.Current(service.generate(request.unidade_escolar_id(), request.base_url()));
    }

    @PostMapping("/atual")
    public SchoolQrResponse.Current current(@RequestBody SchoolQrRequest request) {
        return new SchoolQrResponse.Current(service.current(request.unidade_escolar_id(), request.base_url()));
    }

    @PostMapping("/resolver")
    public SchoolQrResponse.Resolution resolve(@RequestBody SchoolQrRequest request) {
        return new SchoolQrResponse.Resolution(service.resolve(request.token()));
    }
}
