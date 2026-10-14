package br.com.atestaponto.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import br.com.atestaponto.employee.dto.EmployeeDetailRequest;
import br.com.atestaponto.employee.dto.EmployeeDetailResponse;
import br.com.atestaponto.employee.dto.EmployeeListRequest;
import br.com.atestaponto.employee.dto.EmployeeListResponse;
import br.com.atestaponto.repository.EmployeeRepository;

@Service
public class EmployeeService {
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private final EmployeeRepository repository;

    public EmployeeService(EmployeeRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public EmployeeListResponse list(EmployeeListRequest request) {
        if (request == null || request.escopo_global() == null || request.unidades_escolares_ids() == null
                || request.page() == null || request.page() < 1 || request.limit() == null
                || request.limit() < 1 || request.limit() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filtros de funcionario invalidos");
        }

        if (request.unidades_escolares_ids().stream().anyMatch(id -> !validId(id))
                || (Boolean.TRUE.equals(request.escopo_global())
                        && !request.unidades_escolares_ids().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escopo de funcionario invalido");
        }

        return repository.list(request);
    }

    @Transactional(readOnly = true)
    public EmployeeDetailResponse findAdminEmployeeById(EmployeeDetailRequest request) {
        if (request == null || !validId(request.funcionario_id()) || !validId(request.vinculo_id())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificadores de funcionario invalidos");
        }
        return repository.findAdminEmployeeById(request)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Funcionario nao encontrado"));
    }

    private boolean validId(Long id) {
        return id != null && id > 0 && id <= MAX_SAFE_INTEGER;
    }
}
