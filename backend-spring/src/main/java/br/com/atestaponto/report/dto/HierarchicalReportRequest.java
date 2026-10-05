package br.com.atestaponto.report.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.util.List;

public record HierarchicalReportRequest(String data, Boolean escopo_global,
        @JsonSetter(nulls = Nulls.FAIL, contentNulls = Nulls.FAIL)
        @JsonDeserialize(contentUsing = DailyReportSchoolIdDeserializer.class)
        List<Long> unidades_escolares_ids,
        @JsonSetter(nulls = Nulls.FAIL, contentNulls = Nulls.FAIL)
        @JsonDeserialize(contentUsing = DailyReportSchoolIdDeserializer.class)
        List<Long> diretorias_ensino_ids,
        @JsonDeserialize(using = DailyReportSchoolIdDeserializer.class)
        Long diretoria_ensino_id,
        @JsonDeserialize(using = DailyReportSchoolIdDeserializer.class)
        Long unidade_escolar_id) {}
