package br.com.atestaponto.report.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;

public class WeeklyReportScopeDeserializer extends JsonDeserializer<Boolean> {

    @Override
    public Boolean deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (parser.currentToken() == JsonToken.VALUE_TRUE) return true;
        if (parser.currentToken() == JsonToken.VALUE_FALSE) return false;
        return context.reportInputMismatch(Boolean.class, "escopo_global deve ser um boolean JSON");
    }
}
