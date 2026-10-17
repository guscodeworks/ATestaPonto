package br.com.atestaponto.educationdepartment.service;

import br.com.atestaponto.auth.admin.service.PublicSchoolAuthorization;
import br.com.atestaponto.educationdepartment.dto.EducationDepartmentRequest;
import br.com.atestaponto.educationdepartment.dto.EducationDepartmentResponse;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicEducationDepartmentService {
    private final EducationDepartmentService departments;
    private final PublicSchoolAuthorization authorization;

    public PublicEducationDepartmentService(EducationDepartmentService departments, PublicSchoolAuthorization authorization) {
        this.departments = departments;
        this.authorization = authorization;
    }

    public Map<String, ?> list(long adminId, MultiValueMap<String, String> query) {
        authorization.manageDepartments(adminId);
        var values = query.get("ativo");
        if (values != null && (values.size() != 1 || !java.util.Set.of("true", "false").contains(values.getFirst()))) {
            throw badRequest("Status de DRE invalido");
        }
        Boolean active = values == null ? null : Boolean.valueOf(values.getFirst());
        return Map.of("items", departments.list(active).stream().map(this::project).toList());
    }

    public Map<String, Object> create(long adminId, JsonNode body) {
        authorization.manageDepartments(adminId);
        var request = data(body);
        var result = departments.createAuthorized(request, () -> authorization.manageDepartmentsForUpdate(adminId));
        return audited("diretoria_criada", adminId, result);
    }

    public Map<String, Object> update(long adminId, String rawId, JsonNode body) {
        authorization.manageDepartments(adminId);
        long id = id(rawId);
        var request = data(body);
        // O service de dominio relê a DRE sob FOR UPDATE na mesma transacao da escrita.
        var result = departments.updateAuthorized(id, request, () -> authorization.manageDepartmentsForUpdate(adminId));
        return audited("diretoria_editada", adminId, result);
    }

    public Map<String, Object> status(long adminId, String rawId, JsonNode body) {
        authorization.manageDepartments(adminId);
        if (body == null || !body.path("ativo").isBoolean()) throw badRequest("Informe ativo como booleano");
        long id = id(rawId);
        boolean active = body.get("ativo").booleanValue();
        var result = departments.changeStatusAuthorized(id, active, () -> authorization.manageDepartmentsForUpdate(adminId));
        return audited(active ? "diretoria_ativada" : "diretoria_desativada", adminId, result);
    }

    private EducationDepartmentRequest data(JsonNode body) {
        return new EducationDepartmentRequest(text(body, "nome", 150), text(body, "codigo", 50),
                text(body, "cidade_sede", 100));
    }

    private String text(JsonNode body, String field, int max) {
        var value = body == null ? null : body.get(field);
        if (value == null || !value.isTextual() || value.textValue().strip().isEmpty()
                || value.textValue().strip().length() > max) {
            throw badRequest("Campo " + field + " obrigatorio, com ate " + max + " caracteres");
        }
        return value.textValue().strip();
    }

    private long id(String value) {
        try {
            if (!value.matches("[0-9]+")) throw new NumberFormatException();
            long id = Long.parseLong(value);
            if (id < 1 || id > 4294967295L) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException failure) { throw badRequest("ID de DRE invalido"); }
    }

    private Map<String, Object> project(EducationDepartmentResponse d) {
        return Map.of("id", d.id(), "nome", d.nome(), "codigo", d.codigo(), "cidade_sede", d.cidadeSede(), "ativo", d.ativo());
    }

    private Map<String, Object> audited(String event, long adminId, EducationDepartmentResponse result) {
        LoggerFactory.getLogger(PublicEducationDepartmentService.class).info(
                "audit_evento evento={} adminId={} diretoriaEnsinoId={}", event, adminId, result.id());
        return project(result);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
