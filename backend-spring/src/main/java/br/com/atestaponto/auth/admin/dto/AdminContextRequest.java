package br.com.atestaponto.auth.admin.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

public record AdminContextRequest(
        @JsonDeserialize(using = AdminIdDeserializer.class) Long admin_id) {}
