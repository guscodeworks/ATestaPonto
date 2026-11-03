package br.com.atestaponto.schoolqr.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record SchoolQrRequest(JsonNode unidade_escolar_id, String base_url, JsonNode token) {}
