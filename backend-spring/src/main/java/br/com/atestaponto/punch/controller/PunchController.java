package br.com.atestaponto.punch.controller;

import br.com.atestaponto.punch.dto.PunchRequest;
import br.com.atestaponto.punch.dto.PunchResponse;
import br.com.atestaponto.punch.service.PunchService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/ponto")
public class PunchController {
    private final PunchService service;

    public PunchController(PunchService service) { this.service = service; }

    @PostMapping("/registrar")
    public PunchResponse.Registration register(@RequestBody PunchRequest request) {
        return service.register(request);
    }

    @PostMapping("/hoje")
    public PunchResponse.Today today(@RequestBody PunchRequest request) {
        return service.today(request);
    }

    @PostMapping("/historico")
    public PunchResponse.History history(@RequestBody PunchRequest request) {
        return service.history(request);
    }
}
