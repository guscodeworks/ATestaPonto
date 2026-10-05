package br.com.atestaponto.report.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.util.List;

// O gateway produz este escopo depois de validar sessao e capacidade.
public record DailyReportRequest(String data, Boolean escopo_global,
        @JsonSetter(nulls = Nulls.FAIL, contentNulls = Nulls.FAIL)
        @JsonDeserialize(contentUsing = DailyReportSchoolIdDeserializer.class)
        List<Long> unidades_escolares_ids) {}
