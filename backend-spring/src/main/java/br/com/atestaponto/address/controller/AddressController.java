package br.com.atestaponto.address.controller;

import br.com.atestaponto.address.dto.AddressResponse;
import br.com.atestaponto.address.service.AddressService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/enderecos/cep")
public class AddressController {

    private final AddressService service;

    public AddressController(AddressService service) {
        this.service = service;
    }

    @GetMapping("/{cep}")
    public AddressResponse findByCep(@PathVariable("cep") String cep) {
        return service.findByCep(cep);
    }
}
