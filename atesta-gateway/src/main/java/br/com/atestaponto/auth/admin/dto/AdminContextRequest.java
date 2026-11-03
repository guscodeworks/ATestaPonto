package br.com.atestaponto.auth.admin.dto;

import br.com.atestaponto.json.StrictIntegerDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

public record AdminContextRequest(
        @JsonDeserialize(using = StrictIntegerDeserializer.class) Long admin_id) {}
