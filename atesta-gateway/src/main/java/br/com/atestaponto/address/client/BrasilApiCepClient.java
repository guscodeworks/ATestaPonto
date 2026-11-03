package br.com.atestaponto.address.client;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class BrasilApiCepClient {

    private final RestClient restClient;

    public BrasilApiCepClient(@Qualifier("brasilApiRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public BrasilApiCepResponse findByCep(String cep) {
        try {
            BrasilApiCepResponse response = restClient.get()
                    .uri("/api/cep/v2/{cep}", cep)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .onStatus(status -> !status.is2xxSuccessful(), (request, externalResponse) -> {
                        int status = externalResponse.getStatusCode().value();
                        if (status == 400) {
                            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CEP invalido");
                        }
                        if (status == 404) {
                            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "CEP nao encontrado");
                        }
                        throw unavailable();
                    })
                    .body(BrasilApiCepResponse.class);
            if (response == null || !cep.equals(response.cep())
                    || response.state() == null || response.city() == null) {
                throw unavailable();
            }
            return response;
        } catch (RestClientException exception) {
            // Não inclui resposta, URL ou detalhes internos do provedor no erro local.
            throw unavailable();
        }
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY, "Servico de consulta de CEP indisponivel");
    }
}
