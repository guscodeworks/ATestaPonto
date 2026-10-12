package br.com.atestaponto.punch.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

public record PunchRequest(JsonNode funcionario_id, String chave_idempotencia,
        String leitura_json, JsonNode mes, Instant referencia) {}
