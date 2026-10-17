package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.school.dto.SchoolListResponse;
import br.com.atestaponto.school.service.SchoolService;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicSchoolAuthorization {
    public record Scope(boolean global, List<Long> schoolIds) {}
    private final PublicAdminAuthorization admins;
    private final SchoolService schools;

    public PublicSchoolAuthorization(PublicAdminAuthorization admins, SchoolService schools) {
        this.admins = admins;
        this.schools = schools;
    }

    @Transactional(readOnly = true)
    public Scope schoolScope(long adminId) {
        var admin = admins.requireActive(adminId);
        boolean global = admin.acessos().stream().anyMatch(a -> "ADMIN_SEDUC".equals(a.perfil()));
        var units = new LinkedHashSet<Long>();
        for (var access : admin.acessos()) {
            if ("ADMIN_DIRETORIA".equals(access.perfil())) {
                if (!global) {
                    try {
                        schools.listForScope(access.diretoria_ensino_id()).forEach(u -> units.add(u.id()));
                    } catch (DataAccessException failure) {
                        throw denied("Falha ao resolver escopo administrativo");
                    }
                }
            } else if (access.unidade_escolar_id() != null) {
                units.add(access.unidade_escolar_id());
            }
        }
        return new Scope(global, global ? List.of() : List.copyOf(units));
    }

    @Transactional(readOnly = true)
    public SchoolListResponse.Item school(long adminId, long id) {
        var admin = admins.requireActive(adminId);
        try {
            var school = schools.findForAdmin(id);
            if (admin.acessos().stream().anyMatch(a -> switch (a.perfil()) {
                case "ADMIN_SEDUC" -> true;
                case "ADMIN_DIRETORIA" -> Long.valueOf(school.diretoria_ensino_id()).equals(a.diretoria_ensino_id());
                default -> Long.valueOf(school.id()).equals(a.unidade_escolar_id());
            })) return school;
        } catch (ResponseStatusException missing) {
            if (missing.getStatusCode().value() != 404) throw missing;
        } catch (DataAccessException failure) {
            throw denied("Falha ao validar escopo da unidade escolar");
        }
        throw denied("Unidade escolar fora do escopo do administrador");
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public List<Long> creationDepartments(long adminId) {
        var ids = admins.requireActive(adminId).acessos().stream()
                .filter(a -> "ADMIN_DIRETORIA".equals(a.perfil()))
                .map(AdminContextResponse.Access::diretoria_ensino_id).distinct().toList();
        if (ids.isEmpty()) throw denied("Capacidade administrativa insuficiente");
        return ids;
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public void creation(long adminId, Long departmentId) {
        if (!creationDepartments(adminId).contains(departmentId)) {
            throw denied("Diretoria de ensino fora do escopo do administrador");
        }
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public void manageDepartments(long adminId) {
        if (admins.requireActive(adminId).acessos().stream().noneMatch(a -> "ADMIN_SEDUC".equals(a.perfil()))) {
            throw denied("Capacidade administrativa insuficiente");
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void creationForUpdate(long adminId, long departmentId) {
        // Leitura corrente e locks na mesma conexao da escrita, sem suspender/exaurir o pool.
        if (admins.requireActiveForUpdate(adminId).acessos().stream().noneMatch(a ->
                "ADMIN_DIRETORIA".equals(a.perfil()) && Long.valueOf(departmentId).equals(a.diretoria_ensino_id()))) {
            throw denied("Diretoria de ensino fora do escopo do administrador");
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void manageDepartmentsForUpdate(long adminId) {
        if (admins.requireActiveForUpdate(adminId).acessos().stream().noneMatch(a -> "ADMIN_SEDUC".equals(a.perfil()))) {
            throw denied("Capacidade administrativa insuficiente");
        }
    }

    private static ResponseStatusException denied(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }
}
