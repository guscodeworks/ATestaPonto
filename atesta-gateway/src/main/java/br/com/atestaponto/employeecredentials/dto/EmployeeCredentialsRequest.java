package br.com.atestaponto.employeecredentials.dto;

import com.fasterxml.jackson.databind.JsonNode;

public final class EmployeeCredentialsRequest {
    private EmployeeCredentialsRequest() {}

    public record Recovery(JsonNode cpf) {}
    public record Change(JsonNode funcionario_id, JsonNode senha_hash, String versao_credencial) {
        public Change(JsonNode funcionario_id, JsonNode senha_hash) { this(funcionario_id, senha_hash, null); }
        @Override public String toString() { return "Change[redacted]"; }
    }
    public record Login(JsonNode cpf, JsonNode email) {}
    public record EmployeeId(JsonNode funcionario_id) {}
}
