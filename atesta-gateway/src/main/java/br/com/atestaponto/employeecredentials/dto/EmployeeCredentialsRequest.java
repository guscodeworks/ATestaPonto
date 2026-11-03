package br.com.atestaponto.employeecredentials.dto;

import com.fasterxml.jackson.databind.JsonNode;

public final class EmployeeCredentialsRequest {
    private EmployeeCredentialsRequest() {}

    public record Recovery(JsonNode cpf) {}
    public record Change(JsonNode funcionario_id, JsonNode senha_hash) {}
    public record Login(JsonNode cpf, JsonNode email) {}
    public record EmployeeId(JsonNode funcionario_id) {}
}
