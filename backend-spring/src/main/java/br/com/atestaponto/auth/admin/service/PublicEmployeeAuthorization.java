package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import br.com.atestaponto.employmentlink.service.EmploymentLinkReadService;
import br.com.atestaponto.school.service.SchoolService;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicEmployeeAuthorization {
    public static final String CONTEXT_ATTRIBUTE = "br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization";
    // Handlers publicos devem consumir este atributo, nunca DTOs internos de autorizacao vindos do cliente.
    public record Context(long adminId, String capability, List<Long> schoolIds,
            Long targetSchoolId, Long targetDepartmentId, EmploymentLinkScopeResponse link) {
        public Context { schoolIds = List.copyOf(schoolIds); }
    }

    private final SchoolService schools;
    private final EmploymentLinkReadService links;

    public PublicEmployeeAuthorization(SchoolService schools, EmploymentLinkReadService links) {
        this.schools = schools;
        this.links = links;
    }

    @Transactional(readOnly = true)
    public Context authorize(AdminContextResponse admin, String capability, Long employeeId, Long schoolId) {
        if (admin == null || admin.admin() == null || !admin.admin().ativo() || admin.acessos() == null) {
            throw denied();
        }
        var accesses = admin.acessos().stream().filter(a -> permits(a.perfil(), capability)).toList();
        if (accesses.isEmpty()) throw denied();

        var units = new LinkedHashSet<Long>();
        for (var access : accesses) {
            if ("ADMIN_DIRETORIA".equals(access.perfil())) {
                schools.listForScope(access.diretoria_ensino_id()).forEach(unit -> units.add(unit.id()));
            } else {
                // Resolve a unidade persistida; o navegador nao fornece a DRE autorizadora.
                var unit = schools.findForScope(access.unidade_escolar_id());
                if (unit.diretoria_ensino_id() <= 0) throw denied();
                units.add(unit.id());
            }
        }
        if (units.isEmpty()) throw denied();

        EmploymentLinkScopeResponse link = null;
        if (employeeId != null) {
            link = (switch (capability) {
                case "funcionario.visualizar" -> links.findVisibleForAdminByEmployeeId(employeeId);
                case "funcionario.reativar" -> links.findLatestByEmployeeId(employeeId);
                default -> links.findActiveByEmployeeId(employeeId);
            }).orElseThrow(PublicEmployeeAuthorization::denied);
            if (link.diretoria_ensino_id() == null || link.diretoria_ensino_id() <= 0
                    || !units.contains(link.unidade_escolar_id())) throw denied();
        }
        Long departmentId = null;
        if (schoolId != null) {
            if (!units.contains(schoolId)) throw denied();
            departmentId = schools.findForScope(schoolId).diretoria_ensino_id();
            if (departmentId <= 0) throw denied();
        }
        return new Context(admin.admin().id(), capability, List.copyOf(units), schoolId, departmentId, link);
    }

    private boolean permits(String profile, String capability) {
        // Este fluxo so autoriza capacidades de funcionario; as demais seguem negadas aqui.
        return capability != null && capability.startsWith("funcionario.") && AdminAccessPolicy.permits(profile, capability);
    }

    private static ResponseStatusException denied() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "Operacao fora do escopo administrativo");
    }
}
