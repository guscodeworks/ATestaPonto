package br.com.atestaponto.cargo.controller;

import br.com.atestaponto.cargo.dto.CargoResponse;
import br.com.atestaponto.cargo.service.CargoReadService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/cargos")
public class CargoReadController {
    private final CargoReadService service;

    public CargoReadController(CargoReadService service) {
        this.service = service;
    }

    @GetMapping
    public List<CargoResponse> list() {
        return service.list();
    }
}
