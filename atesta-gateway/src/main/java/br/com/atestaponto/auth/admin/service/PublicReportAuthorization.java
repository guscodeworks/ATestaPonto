package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.school.service.SchoolService;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicReportAuthorization {
    public record Scope(boolean global, List<Long> schools, List<Long> departments) {}
    private final SchoolService schools;

    public PublicReportAuthorization(SchoolService schools) { this.schools = schools; }

    @Transactional(readOnly = true)
    public Scope authorize(AdminContextResponse admin, String capability) {
        var accesses = admin.acessos().stream().filter(a -> AdminAccessPolicy.permits(a.perfil(), capability)).toList();
        if (accesses.isEmpty()) throw denied("Capacidade administrativa insuficiente");
        if (accesses.stream().anyMatch(a -> "ADMIN_SEDUC".equals(a.perfil()))) {
            return new Scope(true, List.of(), List.of());
        }
        var units = new LinkedHashSet<Long>();
        var departments = new LinkedHashSet<Long>();
        for (var access : accesses) {
            if ("ADMIN_DIRETORIA".equals(access.perfil())) departments.add(access.diretoria_ensino_id());
            else if (access.unidade_escolar_id() != null) units.add(access.unidade_escolar_id());
        }
        try {
            for (long id : departments) schools.listForScope(id).forEach(school -> units.add(school.id()));
        } catch (DataAccessException failure) {
            throw denied("Falha ao resolver escopo administrativo");
        }
        // Uma diretoria sem escolas pode consultar apenas agregados vazios, nunca escopo global.
        return new Scope(false, List.copyOf(units), List.copyOf(departments));
    }

    private ResponseStatusException denied(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }
}
