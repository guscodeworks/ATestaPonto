package br.com.atestaponto.school.service;

import br.com.atestaponto.address.service.AddressService;
import br.com.atestaponto.auth.admin.service.PublicSchoolAuthorization;
import br.com.atestaponto.educationdepartment.service.EducationDepartmentService;
import br.com.atestaponto.school.dto.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;
import static br.com.atestaponto.school.dto.PublicSchoolInput.*;

@Service
public class PublicSchoolService {
    private final SchoolService schools;
    private final EducationDepartmentService departments;
    private final AddressService addresses;
    private final PublicSchoolAuthorization authorization;
    private final ObjectMapper json;
    private final Validator validator;

    public PublicSchoolService(SchoolService schools, EducationDepartmentService departments,
            AddressService addresses, PublicSchoolAuthorization authorization, ObjectMapper json, Validator validator) {
        this.schools = schools;
        this.departments = departments;
        this.addresses = addresses;
        this.authorization = authorization;
        this.json = json;
        this.validator = validator;
    }

    public SchoolListResponse list(long adminId, MultiValueMap<String, String> query) {
        var scope = authorization.schoolScope(adminId);
        long page = integer(single(query, "page", "1"), 9007199254740991L, "page", "query");
        int limit = (int) integer(single(query, "limit", "20"), 100, "limit", "query");
        String active = single(query, "ativa", null);
        if (active != null && !Set.of("true", "false", "1", "0").contains(active)) {
            throw invalid("ativa", "query", "ativa invalido");
        }
        String department = single(query, "diretoria_ensino_id", null);
        Long departmentId = department == null ? null
                : integer(department, 9007199254740991L, "diretoria_ensino_id", "query");
        String q = single(query, "q", "").strip();
        if (q.codePointCount(0, q.length()) > 120) throw invalid("q", "query", "q deve ter no maximo 120 caracteres");
        return schools.listForAdmin(new SchoolListRequest(scope.global(), scope.schoolIds(), departmentId,
                active == null ? null : active.equals("true") || active.equals("1"), q, page, limit));
    }

    public SchoolListResponse.Item find(long adminId, String rawId) {
        long id = integer(rawId, 9007199254740991L, "id", "params");
        return authorization.school(adminId, id);
    }

    public Map<String, ?> registrationDepartments(long adminId) {
        var ids = authorization.creationDepartments(adminId);
        return Map.of("items", departments.list(true).stream().filter(d -> ids.contains(d.id()))
                .map(d -> Map.of("id", d.id(), "nome", d.nome(), "codigo", d.codigo(), "cidade_sede", d.cidadeSede())).toList());
    }

    public Map<String, Object> cep(long adminId, String rawCep) {
        authorization.creationDepartments(adminId);
        String cep = rawCep.replaceAll("[^0-9]", "");
        if (!cep.matches("[0-9]{8}") || cep.matches("([0-9])\\1{7}")) {
            throw invalid("cep", "params", "CEP deve ter 8 digitos validos");
        }
        var address = addresses.findByCep(cep);
        var result = new LinkedHashMap<String, Object>();
        result.put("cep", address.cep());
        result.put("logradouro", address.street());
        result.put("bairro", address.neighborhood());
        result.put("cidade", address.city());
        result.put("uf", address.state());
        result.put("latitude", address.latitude());
        result.put("longitude", address.longitude());
        result.put("geolocalizacao_disponivel", address.latitude() != null);
        return result;
    }

    public SchoolPreviewResponse preview(long adminId, JsonNode body) {
        return schools.preview(request(adminId, body, "Dados de preview invalidos"));
    }

    public SchoolResponse create(long adminId, JsonNode body) {
        var request = request(adminId, body, "Dados de escola invalidos");
        var result = schools.createAuthorized(request,
                () -> authorization.creationForUpdate(adminId, request.diretoriaEnsinoId()));
        LoggerFactory.getLogger(PublicSchoolService.class).info(
                "audit_evento evento=escola_criada adminId={} escolaId={} diretoriaEnsinoId={}",
                adminId, result.id(), result.diretoriaEnsinoId());
        return result;
    }

    private SchoolPreviewRequest request(long adminId, JsonNode body, String message) {
        authorization.creationDepartments(adminId);
        JsonNode department = body == null ? null : body.get("diretoria_ensino_id");
        Long departmentId = null;
        if (department != null && (department.isIntegralNumber() || department.isTextual())) {
            try { departmentId = Long.valueOf(department.asText()); } catch (NumberFormatException ignored) { }
        }
        authorization.creation(adminId, departmentId);
        try {
            var request = json.treeToValue(body, SchoolPreviewRequest.class);
            if (request == null || !validator.validate(request).isEmpty()) throw new IllegalArgumentException();
            return request;
        } catch (com.fasterxml.jackson.core.JsonProcessingException | IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
    }
}
