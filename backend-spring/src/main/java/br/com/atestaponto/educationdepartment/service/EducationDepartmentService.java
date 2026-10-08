package br.com.atestaponto.educationdepartment.service;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import br.com.atestaponto.educationdepartment.dto.EducationDepartmentResponse;
import br.com.atestaponto.educationdepartment.repository.EducationDepartmentRepository;

@Service
public class EducationDepartmentService {

    private final EducationDepartmentRepository repository;

    public EducationDepartmentService(EducationDepartmentRepository repository) {
        this.repository = repository;
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
