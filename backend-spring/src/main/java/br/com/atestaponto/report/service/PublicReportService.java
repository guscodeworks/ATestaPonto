package br.com.atestaponto.report.service;

import br.com.atestaponto.auth.admin.service.PublicReportAuthorization.Scope;
import br.com.atestaponto.report.dto.*;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicReportService {
    private final DailyReportService daily;
    private final WeeklyReportService weekly;
    private final HierarchicalReportService hierarchy;

    public PublicReportService(DailyReportService daily, WeeklyReportService weekly, HierarchicalReportService hierarchy) {
        this.daily = daily; this.weekly = weekly; this.hierarchy = hierarchy;
    }

    public Object read(String report, MultiValueMap<String, String> query, Scope scope, long adminId, String ip) {
        String date = report.equals("resumo") ? today() : date(query, report.equals("relatorio/semanal"));
        if (report.equals("relatorio/semanal")) {
            return weekly.report(new WeeklyReportRequest(date, scope.global(), scope.schools()));
        }
        if (report.equals("relatorio/hierarquia")) {
            Long school = filter(query, "unidade_escolar_id"), department = filter(query, "diretoria_ensino_id");
            if (school != null && !scope.global() && !scope.schools().contains(school)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Recurso fora do escopo autorizado");
            }
            var result = hierarchy.report(new HierarchicalReportRequest(date, scope.global(), scope.schools(),
                    scope.departments(), department, school));
            var metadata = new LinkedHashMap<String, Object>();
            metadata.put("data_referencia", date);
            metadata.put("diretoria_ensino_id", department);
            metadata.put("unidade_escolar_id", school);
            audit(adminId, ip, "Administrador consultou relatorio hierarquico de ponto", metadata);
            return result;
        }
        var snapshot = daily.snapshot(new DailyReportRequest(date, scope.global(), scope.schools()));
        // Projeta o contrato publico: totais internos e outras listas nao atravessam a fronteira.
        var result = new LinkedHashMap<String, Object>();
        result.put("data_referencia", date);
        result.put("resumo", snapshot.resumo());
        if (report.equals("hoje")) {
            result.put("presentes", snapshot.presentes());
            result.put("ausentes", snapshot.ausentes());
        } else if (report.equals("relatorio")) {
            result.put("items", snapshot.relatorio());
            audit(adminId, ip, "Administrador consultou relatorio de ponto", Map.of("data_referencia", date));
        }
        return result;
    }

    private String date(MultiValueMap<String, String> query, boolean weekly) {
        String value = single(query, "data", "Data invalida. Use o formato YYYY-MM-DD");
        if (value == null || (!weekly && value.isEmpty())) value = today();
        String date = value.strip();
        // O Express valida a forma antes da chamada interna; datas impossiveis usam o erro interno.
        if (!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw badDate();
        try {
            LocalDate parsed = LocalDate.parse(date);
            if (weekly && parsed.getYear() < 1000) throw badDate();
        } catch (java.time.format.DateTimeParseException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, weekly
                    ? "Data invalida. Use o formato YYYY-MM-DD" : "Data ou escopo de relatorio invalido");
        }
        return date;
    }

    private Long filter(MultiValueMap<String, String> query, String name) {
        String value = single(query, name, "Filtro de relatorio invalido");
        if (value == null) return null;
        try {
            if (!value.matches("[1-9][0-9]*")) throw new NumberFormatException();
            long id = Long.parseLong(value);
            if (id > 9007199254740991L) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filtro de relatorio invalido");
        }
    }

    private String single(MultiValueMap<String, String> query, String name, String message) {
        if (query.keySet().stream().anyMatch(key -> key.startsWith(name + "["))
                || query.containsKey(name) && query.get(name).size() != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return query.getFirst(name);
    }

    private ResponseStatusException badDate() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Data invalida. Use o formato YYYY-MM-DD");
    }

    private String today() { return LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString(); }

    private void audit(long adminId, String ip, String message, Map<String, ?> metadata) {
        LoggerFactory.getLogger(PublicReportService.class).info(
                "audit_evento evento=relatorio_consultado adminId={} ipOrigem={} mensagem={} metadados={}",
                adminId, ip == null ? "" : ip.replaceAll("[\\r\\n]", ""), message, metadata);
    }
}
