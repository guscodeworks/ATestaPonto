package br.com.atestaponto.employmentlink.service;

import br.com.atestaponto.employmentlink.dto.EmploymentLinkScopeResponse;
import br.com.atestaponto.employmentlink.repository.EmploymentLinkReadRepository;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmploymentLinkReadService {
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private final EmploymentLinkReadRepository repository;

    public EmploymentLinkReadService(EmploymentLinkReadRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Optional<EmploymentLinkScopeResponse> findActiveByEmployeeId(Long employeeId) {
        validateId(employeeId);
        return repository.findActiveByEmployeeId(employeeId);
    }

    @Transactional(readOnly = true)
    public Optional<EmploymentLinkScopeResponse> findVisibleForAdminByEmployeeId(Long employeeId) {
        validateId(employeeId);
        return repository.findVisibleForAdminByEmployeeId(employeeId);
    }

    @Transactional(readOnly = true)
    public Optional<EmploymentLinkScopeResponse> findLatestByEmployeeId(Long employeeId) {
        validateId(employeeId);
        return repository.findLatestByEmployeeId(employeeId);
    }

    // Participa da transacao de escrita do chamador; o repositorio recusa transacao read-only.
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<EmploymentLinkScopeResponse> findActiveByEmployeeIdInWriteTransaction(Long employeeId) {
        validateId(employeeId);
        return repository.findActiveByEmployeeIdInWriteTransaction(employeeId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<EmploymentLinkScopeResponse> findVisibleForAdminByEmployeeIdInWriteTransaction(Long employeeId) {
        validateId(employeeId);
        return repository.findVisibleForAdminByEmployeeIdInWriteTransaction(employeeId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<EmploymentLinkScopeResponse> findLatestByEmployeeIdInWriteTransaction(Long employeeId) {
        validateId(employeeId);
        return repository.findLatestByEmployeeIdInWriteTransaction(employeeId);
    }

    private void validateId(Long id) {
        if (id == null || id < 1 || id > MAX_SAFE_INTEGER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador de funcionario invalido");
        }
    }
}
