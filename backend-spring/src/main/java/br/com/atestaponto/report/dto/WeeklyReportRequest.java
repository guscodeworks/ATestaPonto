package br.com.atestaponto.report.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.util.List;

public record WeeklyReportRequest(String data,
        @JsonProperty(required = true)
        @JsonSetter(nulls = Nulls.FAIL)
        @JsonDeserialize(using = WeeklyReportScopeDeserializer.class)
        Boolean escopo_global,
        @JsonProperty(required = true)
        @JsonSetter(nulls = Nulls.FAIL, contentNulls = Nulls.FAIL)
        @JsonDeserialize(contentUsing = WeeklyReportSchoolIdDeserializer.class)
        List<Long> unidades_escolares_ids) {}
