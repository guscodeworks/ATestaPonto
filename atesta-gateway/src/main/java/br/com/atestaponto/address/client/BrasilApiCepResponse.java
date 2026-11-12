package br.com.atestaponto.address.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public record BrasilApiCepResponse(
        String cep,
        String state,
        String city,
        String neighborhood,
        String street,
        String service,
        Location location) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Location(Coordinates coordinates) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Coordinates(BigDecimal latitude, BigDecimal longitude) {
    }
}
