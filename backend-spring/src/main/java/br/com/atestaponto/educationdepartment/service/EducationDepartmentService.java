package br.com.atestaponto.educationdepartment.service;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import br.com.atestaponto.educationdepartment.dto.EducationDepartmentResponse;
import br.com.atestaponto.educationdepartment.dto.EducationDepartmentRequest;
import br.com.atestaponto.educationdepartment.repository.EducationDepartmentRepository;

@Service
public class EducationDepartmentService {

    private final EducationDepartmentRepository repository;

    public EducationDepartmentService(EducationDepartmentRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public EducationDepartmentResponse create(EducationDepartmentRequest request) {
        return createAuthorized(request, () -> {});
    }

    @Transactional
    public EducationDepartmentResponse createAuthorized(EducationDepartmentRequest request, Runnable reauthorize) {
        reauthorize.run();
        long id = repository.create(request);
        return repository.findForUpdate(id).orElseThrow();
    }

    @Transactional
    public EducationDepartmentResponse update(Long id, EducationDepartmentRequest request) {
        return updateAuthorized(id, request, () -> {});
    }

    @Transactional
    public EducationDepartmentResponse updateAuthorized(Long id, EducationDepartmentRequest request, Runnable reauthorize) {
        requireForUpdate(id);
        reauthorize.run();
        repository.update(id, request);
        return repository.findForUpdate(id).orElseThrow();
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public EducationDepartmentResponse changeStatus(Long id, boolean active) {
        return changeStatusAuthorized(id, active, () -> {});
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public EducationDepartmentResponse changeStatusAuthorized(Long id, boolean active, Runnable reauthorize) {
        requireForUpdate(id);
        reauthorize.run();
        if (!active && repository.hasDependenciesForDeactivation(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A DRE possui escolas ativas, vinculos funcionais nao encerrados ou acessos administrativos vigentes");
        }
        repository.changeStatus(id, active);
        return repository.findForUpdate(id).orElseThrow();
    }

    private void requireForUpdate(Long id) {
        if (id == null || id <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID de diretoria invalido");
        }
        repository.findForUpdate(id).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Diretoria de ensino nao encontrada"));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void requireActiveForSchoolCreation(long id) {
        boolean active = repository.findActiveForSchoolCreation(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Diretoria de ensino nao encontrada"));

        if (!active) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Diretoria de ensino inativa");
        }
    }

    @Transactional(readOnly = true)
    public List<EducationDepartmentResponse> list(Boolean ativo) {
        return repository.list(ativo);
    }

    @Transactional(readOnly = true)
    public EducationDepartmentResponse findById(Long id) {
        if (id == null || id <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "ID de diretoria invalido");
        }

        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Diretoria de ensino nao encontrada"));
    }
}
