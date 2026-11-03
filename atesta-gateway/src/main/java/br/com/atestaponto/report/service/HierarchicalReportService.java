package br.com.atestaponto.report.service;

import br.com.atestaponto.report.dto.HierarchicalReportRequest;
import br.com.atestaponto.report.dto.HierarchicalReportResponse;
import br.com.atestaponto.report.dto.HierarchicalReportResponse.*;
import br.com.atestaponto.report.repository.HierarchicalReportRepository;
import br.com.atestaponto.report.repository.HierarchicalReportRepository.Group;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class HierarchicalReportService {
    private final HierarchicalReportRepository repository;

    public HierarchicalReportService(HierarchicalReportRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public HierarchicalReportResponse report(HierarchicalReportRequest request) {
        LocalDate date = ReportDate.parse(request.data());
        if (request.escopo_global() == null || !validIds(request.unidades_escolares_ids())
                || !validIds(request.diretorias_ensino_ids())
                || (request.escopo_global() && (!request.unidades_escolares_ids().isEmpty()
                    || !request.diretorias_ensino_ids().isEmpty()))
                || (request.diretoria_ensino_id() != null && request.diretoria_ensino_id() <= 0)
                || (request.unidade_escolar_id() != null && request.unidade_escolar_id() <= 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escopo ou filtro de relatorio invalido");
        }
        if ((request.diretoria_ensino_id() != null && !repository.departmentVisible(request.diretoria_ensino_id(), request))
                || (request.unidade_escolar_id() != null && !repository.schoolVisible(request.unidade_escolar_id(), request))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Recurso fora do escopo autorizado");
        }
        var total = repository.aggregate(date, request, 0);
        var departments = repository.aggregate(date, request, 1);
        var schools = repository.aggregate(date, request, 2);
        Summary summary = total.isEmpty() ? new Summary(0, 0, 0, 0, 0, 0, 0, 0) : summarize(total.getFirst());
        List<Department> items = departments.stream().map(department -> new Department(
                department.departmentId(), department.departmentName(), summarize(department),
                schools.stream().filter(school -> school.departmentId().equals(department.departmentId()))
                        .map(school -> new School(school.schoolId(), school.schoolName(), summarize(school))).toList())).toList();
        return new HierarchicalReportResponse(date.toString(), summary, items);
    }

    private Summary summarize(Group group) {
        long total = group.totalEmployees();
        long present = group.presentEmployees();
        // total_ativos representa pessoas com vinculo vigente na data consultada.
        return new Summary(total, total, present, total - present,
                total == 0 ? 0 : Math.round(100.0 * present / total),
                group.totalLinks(), group.totalSchools(), group.totalDepartments());
    }

    private boolean validIds(List<Long> ids) {
        return ids != null && ids.stream().allMatch(id -> id != null && id > 0);
    }
}
