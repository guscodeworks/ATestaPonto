package br.com.atestaponto.adminaccess.service;

import br.com.atestaponto.adminaccess.dto.AdminAccessRequest;
import br.com.atestaponto.adminaccess.dto.AdminAccessResponse;
import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.Resource;
import br.com.atestaponto.adminaccess.dto.PublicAccessInput;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import br.com.atestaponto.auth.admin.service.PublicAdminAudit;
import br.com.atestaponto.school.service.SchoolService;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Validator;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;
import static br.com.atestaponto.auth.admin.service.AdminAccessPolicy.*;

@Service
public class PublicAdminAccessService {
    private final AdminAccessService accesses;
    private final PublicAdminAuthorization admins;
    private final SchoolService schools;
    private final Validator validator;

    public PublicAdminAccessService(AdminAccessService accesses, PublicAdminAuthorization admins, SchoolService schools, Validator validator) {
        this.accesses = accesses;
        this.admins = admins;
        this.schools = schools;
        this.validator = validator;
    }

    private List<Access> capable(long adminId, String capability) {
        return capable(admins.requireActive(adminId).acessos(), capability);
    }

    private static List<Access> capable(List<Access> active, String capability) {
        var result = active.stream().filter(a -> permits(a.perfil(), capability)).toList();
        if (result.isEmpty()) throw forbidden("Capacidade administrativa insuficiente");
        return result;
    }

    private record Scope(boolean global, List<Long> departments, List<Long> ownSchools, List<Long> visibleSchools) {}

    private Scope scope(List<Access> authorizers) {
        boolean global = authorizers.stream().anyMatch(a -> "ADMIN_SEDUC".equals(a.perfil()));
        var departments = authorizers.stream().filter(a -> "ADMIN_DIRETORIA".equals(a.perfil()))
                .map(Access::diretoria_ensino_id).distinct().toList();
        var own = authorizers.stream().filter(a -> SCHOOL_PROFILES.contains(a.perfil())).map(Access::unidade_escolar_id).distinct().toList();
        var visible = new LinkedHashSet<>(own);
        if (!global) {
            try { departments.forEach(id -> schools.listForScope(id).forEach(s -> visible.add(s.id()))); }
            catch (DataAccessException error) { throw forbidden("Falha ao resolver escopo administrativo"); }
        }
        return new Scope(global, departments, own, global ? null : List.copyOf(visible));
    }

    @Transactional(readOnly = true)
    public Map<String, ?> list(long adminId, MultiValueMap<String, String> query) {
        var active = admins.requireActive(adminId).acessos();
        var operators = capable(active, "acesso.listar");
        var scope = scope(operators);
        var pagination = PublicAccessInput.pagination(query);
        long offset;
        try { offset = Math.multiplyExact(pagination.page() - 1, pagination.limit()); }
        catch (ArithmeticException overflow) { offset = Long.MAX_VALUE; }
        var result = accesses.list(new AdminAccessRequest.ListQuery(scope.global(), scope.departments(),
                scope.global() ? List.of() : scope.visibleSchools(), pagination.limit(), offset));
        return Map.of("items", result.items().stream().map(row -> {
            var item = project(row);
            item.put("acoes_permitidas", actions(row, active, adminId));
            return item;
        }).toList(), "pagination", Map.of("page", pagination.page(), "limit", pagination.limit(), "total", result.total()));
    }

    @Transactional(readOnly = true)
    public Map<String, ?> own(long adminId) {
        var active = capable(adminId, "acesso.proprio.visualizar");
        var scope = scope(active);
        var result = new LinkedHashMap<String, Object>();
        result.put("acessos", active.stream().map(a -> {
            var item = new LinkedHashMap<String, Object>();
            item.put("id", a.id()); item.put("perfil", a.perfil());
            item.put("diretoria_ensino_id", a.diretoria_ensino_id()); item.put("unidade_escolar_id", a.unidade_escolar_id());
            item.put("status", a.status()); item.put("data_inicio", a.data_inicio()); item.put("data_fim", a.data_fim());
            item.put("concedido_por_acesso_id", a.concedido_por_acesso_id());
            item.put("criado_em", timestamp(a.criado_em())); item.put("atualizado_em", timestamp(a.atualizado_em()));
            return item;
        }).toList());
        result.put("escopo", Map.of("isSeduc", scope.global(), "diretoriasPermitidas", scope.departments().stream().sorted().toList(),
                "unidadesPermitidas", scope.ownSchools().stream().sorted().toList(), "temAcesso", true));
        result.put("unidadesVisiveis", scope.visibleSchools());
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, ?> capabilities(long adminId) {
        capable(adminId, "acesso.proprio.visualizar");
        return Map.of("perfis", CAPABILITIES.entrySet().stream()
                .map(e -> Map.of("perfil", e.getKey(), "capacidades", e.getValue())).toList());
    }

    @Transactional(readOnly = true)
    public Map<String, ?> options(long adminId) {
        var active = capable(adminId, "acesso.conceder");
        var candidates = CAPABILITIES.keySet().stream().filter(p -> active.stream().anyMatch(a -> delegates(a.perfil(), p, true))).toList();
        var resources = accesses.options(new AdminAccessRequest.Options(candidates.contains("ADMIN_DIRETORIA"),
                candidates.stream().anyMatch(SCHOOL_PROFILES::contains)));
        var profiles = new ArrayList<Map<String, ?>>();
        for (String profile : candidates) {
            boolean department = profile.equals("ADMIN_DIRETORIA");
            var allowed = (department ? resources.diretorias() : resources.unidades()).stream()
                    .filter(r -> authorizer(active, "acesso.conceder", profile,
                            new Resource(department ? r.id() : r.diretoria_ensino_id(), department ? null : r.id()), true) != null)
                    .map(r -> Map.of("id", r.id(), "nome", r.nome())).toList();
            if (!allowed.isEmpty()) profiles.add(Map.of("perfil", profile, "tipo_escopo", department ? "DRE" : "ESCOLA", "recursos", allowed));
        }
        return Map.of("perfis", profiles);
    }

    @Transactional(readOnly = true)
    public Map<String, ?> find(long adminId, String rawId) {
        long id = PublicAccessInput.id(rawId);
        var active = admins.requireActive(adminId).acessos();
        var target = accesses.find(id);
        if (target != null) {
            try {
                var resource = resource(target);
                if (active.stream().anyMatch(a -> permits(a.perfil(), "acesso.visualizar") && covers(a, resource))) {
                    return Map.of("acesso", project(target));
                }
            } catch (AdminAccessException invalid) {
                if (invalid.status() != 400 && invalid.status() != 404) throw invalid;
            }
        }
        throw new AdminAccessException(404, "NOT_FOUND", "Acesso administrativo nao encontrado");
    }

    @Transactional
    public Map<String, ?> grant(long adminId, JsonNode body, String ip) {
        var active = admins.requireActiveForUpdate(adminId).acessos();
        var input = PublicAccessInput.grant(body, validator);
        if (input.inicio() != null && input.fim() != null && input.fim().isBefore(input.inicio())) {
            throw new AdminAccessException(400, "BAD_REQUEST", "data_fim deve ser posterior ou igual a data_inicio");
        }
        var resource = accesses.resource(new AdminAccessRequest.ResourceQuery(input.perfil(), input.diretoriaId(), input.unidadeId()));
        var operator = authorizer(active, "acesso.conceder", input.perfil(), resource, true);
        if (operator == null) throw forbidden("Nenhum acesso administrativo ativo permite conceder este perfil no recurso informado");
        var granted = accesses.grant(input.authorized(adminId, operator.id()));
        var metadata = auditTarget(granted.acesso());
        metadata.put("status", input.status()); metadata.put("criou_identidade", granted.criou_identidade());
        PublicAdminAudit.record("acesso_administrativo_concedido", adminId, ip, metadata);
        var projected = project(granted.acesso());
        projected.put("criou_identidade", granted.criou_identidade());
        return Map.of("acesso", projected);
    }

    @Transactional
    public Map<String, ?> change(long adminId, String rawId, String action, String ip) {
        long id = PublicAccessInput.id(rawId);
        var active = admins.requireActiveForUpdate(adminId).acessos();
        var target = accesses.find(id);
        if (target == null) throw new AdminAccessException(404, "NOT_FOUND", "Acesso administrativo nao encontrado");
        if (target.usuario_administrativo_id() == adminId) throw forbidden("Nao e permitido alterar o proprio acesso");
        var operator = authorizer(active, "acesso." + action, target.perfil(), resource(target), false);
        if (operator == null) throw forbidden("Nenhum acesso administrativo ativo permite alterar este acesso");
        var updated = accesses.change(new AdminAccessRequest.Change(adminId, operator.id(), id, action, target.status()));
        var metadata = auditTarget(target);
        metadata.put("de_status", target.status()); metadata.put("para_status", updated.status());
        PublicAdminAudit.record("acesso_administrativo_" + action, adminId, ip, metadata);
        return Map.of("acesso", project(updated));
    }

    private Resource resource(AdminAccessResponse.Access target) {
        return accesses.resource(new AdminAccessRequest.ResourceQuery(target.perfil(), target.diretoria_ensino_id(), target.unidade_escolar_id()));
    }

    private List<String> actions(AdminAccessResponse.Access target, List<Access> operators, long adminId) {
        if (target.usuario_administrativo_id() == adminId) return List.of();
        Resource resource;
        if ("ADMIN_SEDUC".equals(target.perfil())) resource = new Resource(null, null);
        else if ("ADMIN_DIRETORIA".equals(target.perfil()) && positive(target.diretoria_ensino_id())) resource = new Resource(target.diretoria_ensino_id(), null);
        else if (SCHOOL_PROFILES.contains(target.perfil()) && positive(target.unidade_escolar_id()) && positive(target.unidade_diretoria_ensino_id())) {
            resource = new Resource(target.unidade_diretoria_ensino_id(), target.unidade_escolar_id());
        } else return List.of();
        return List.of("suspender", "reativar", "revogar").stream().filter(action ->
                AdminAccessService.transitionAllowed(action, target.status())
                && authorizer(operators, "acesso." + action, target.perfil(), resource, false) != null).toList();
    }

    private static boolean positive(Long id) { return id != null && id > 0; }
    private static String timestamp(LocalDateTime value) {
        return value == null ? null : new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(value.toInstant(ZoneOffset.UTC));
    }

    private static LinkedHashMap<String, Object> auditTarget(AdminAccessResponse.Access target) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("acesso_id", target.id()); metadata.put("usuario_administrativo_id", target.usuario_administrativo_id());
        metadata.put("perfil", target.perfil()); metadata.put("diretoria_ensino_id", target.diretoria_ensino_id());
        metadata.put("unidade_escolar_id", target.unidade_escolar_id());
        return metadata;
    }

    private static LinkedHashMap<String, Object> project(AdminAccessResponse.Access a) {
        var item = new LinkedHashMap<String, Object>();
        item.put("id", a.id()); item.put("usuario_administrativo_id", a.usuario_administrativo_id()); item.put("perfil", a.perfil());
        item.put("diretoria_ensino_id", a.diretoria_ensino_id()); item.put("diretoria_ensino_nome", a.diretoria_ensino_nome());
        item.put("unidade_escolar_id", a.unidade_escolar_id()); item.put("unidade_escolar_nome", a.unidade_escolar_nome());
        item.put("status", a.status()); item.put("data_inicio", a.data_inicio()); item.put("data_fim", a.data_fim());
        item.put("concedido_por_acesso_id", a.concedido_por_acesso_id()); item.put("criado_em", a.criado_em()); item.put("atualizado_em", a.atualizado_em());
        var user = new LinkedHashMap<String, Object>();
        user.put("cpf", a.usuario_cpf()); user.put("nome", a.usuario_nome()); user.put("email", a.usuario_email()); user.put("ativo", a.usuario_ativo());
        item.put("usuario", user);
        return item;
    }

    private static AdminAccessException forbidden(String message) { return new AdminAccessException(403, "FORBIDDEN", message); }
}
