package br.com.atestaponto.address.dto;

import java.math.BigDecimal;

public record AddressResponse(
        String cep,
        String state,
        String city,
        String neighborhood,
        String street,
        String service,
        BigDecimal latitude,
        BigDecimal longitude) {
}
