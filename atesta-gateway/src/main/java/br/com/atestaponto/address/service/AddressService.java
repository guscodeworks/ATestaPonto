package br.com.atestaponto.address.service;

import br.com.atestaponto.address.client.BrasilApiCepClient;
import br.com.atestaponto.address.client.BrasilApiCepResponse;
import br.com.atestaponto.address.dto.AddressResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AddressService {

    private final BrasilApiCepClient client;

    public AddressService(BrasilApiCepClient client) {
        this.client = client;
    }

    public AddressResponse findByCep(String cep) {
        String normalizedCep = cep == null ? "" : cep.replaceAll("[^0-9]", "");
        if (normalizedCep.length() != 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CEP deve conter 8 digitos");
        }
        BrasilApiCepResponse response = client.findByCep(normalizedCep);
        BrasilApiCepResponse.Coordinates coordinates = response.location() == null
                ? null : response.location().coordinates();
        return new AddressResponse(
                response.cep(), response.state(), response.city(), response.neighborhood(),
                response.street(), response.service(),
                coordinates == null ? null : coordinates.latitude(),
                coordinates == null ? null : coordinates.longitude());
    }
}
