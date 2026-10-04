package br.com.atestaponto.school.service;

import br.com.atestaponto.address.dto.AddressResponse;
import br.com.atestaponto.address.service.AddressService;
import br.com.atestaponto.educationdepartment.dto.EducationDepartmentResponse;
import br.com.atestaponto.educationdepartment.service.EducationDepartmentService;
import br.com.atestaponto.school.dto.SchoolPreviewRequest;
import br.com.atestaponto.school.dto.SchoolPreviewResponse;
import br.com.atestaponto.school.dto.SchoolResponse;
import br.com.atestaponto.school.repository.SchoolRepository;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SchoolService {

    private final SchoolRepository repository;
    private final EducationDepartmentService educationDepartmentService;
    private final AddressService addressService;
    private final TransactionTemplate creationTransaction;

    public SchoolService(SchoolRepository repository,
            EducationDepartmentService educationDepartmentService, AddressService addressService,
            PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.educationDepartmentService = educationDepartmentService;
        this.addressService = addressService;
        this.creationTransaction = new TransactionTemplate(transactionManager);
        this.creationTransaction.setReadOnly(false);
        this.creationTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public SchoolPreviewResponse preview(SchoolPreviewRequest request) {
        String name = normalizeName(request.nome());
        String codigoInep = request.codigoInep();
        if (codigoInep != null) {
            codigoInep = codigoInep.replaceAll("[^0-9]", "");
            if (!codigoInep.matches("[0-9]{8}")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Codigo INEP deve ter 8 digitos");
            }
        }

        EducationDepartmentResponse department = educationDepartmentService.findById(
                request.diretoriaEnsinoId());
        if (!department.ativo()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diretoria de ensino inativa");
        }

        // A consulta da DRE encerra sua transação read-only antes da chamada externa.
        AddressResponse address = addressService.findByCep(request.cep());
        boolean hasCoordinates = address.latitude() != null && address.longitude() != null;
        if (hasCoordinates && (address.latitude().compareTo(BigDecimal.valueOf(-34)) < 0
                || address.latitude().compareTo(BigDecimal.valueOf(6)) > 0
                || address.longitude().compareTo(BigDecimal.valueOf(-74.5)) < 0
                || address.longitude().compareTo(BigDecimal.valueOf(-28)) > 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Localizacao do CEP fora do territorio brasileiro");
        }
        int radius = request.raioPermitidoMetros() == null
                ? 100 : Math.toIntExact(request.raioPermitidoMetros());
        return new SchoolPreviewResponse(
                name, department.id(), department.nome(), codigoInep,
                address.cep(), address.street(), address.city(),
                hasCoordinates ? address.latitude() : null,
                hasCoordinates ? address.longitude() : null,
                radius, true, hasCoordinates ? "BRASILAPI" : null,
                !hasCoordinates,
                hasCoordinates ? null : "Localizacao precisa ser definida antes da persistencia");
    }

    public SchoolResponse create(SchoolPreviewRequest request) {
        // Reexecuta a validacao e a consulta BrasilAPI; nunca recebe coordenadas/endereco do cliente.
        SchoolPreviewResponse school = preview(request);
        if (school.latitude() == null || school.longitude() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Localizacao precisa ser definida antes da criacao da escola");
        }
        String address = normalizeProviderText(school.endereco(), 255, false);
        String city = normalizeProviderText(school.cidade(), 100, true);

        try {
            return creationTransaction.execute(status -> {
                // O bloqueio da DRE permanece ate commit/rollback; nenhuma chamada externa ocorre aqui.
                educationDepartmentService.requireActiveForSchoolCreation(school.diretoriaEnsinoId());
                if (repository.existsByNameInEducationDepartment(school.diretoriaEnsinoId(), school.nome())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Ja existe escola com este nome na diretoria de ensino");
                }
                if (school.codigoInep() != null && repository.existsByCodigoInep(school.codigoInep())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Codigo INEP ja existente");
                }
                return repository.create(school.diretoriaEnsinoId(), school.nome(), school.latitude(),
                        school.longitude(), school.raioPermitidoMetros(), school.codigoInep(), address, city);
            });
        } catch (DuplicateKeyException exception) {
            // O indice unico cobre tambem a corrida entre a consulta de conflito e o INSERT.
            if (school.codigoInep() == null) {
                throw exception;
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Codigo INEP ja existente");
        }
    }

    private String normalizeName(String value) {
        if (value == null || value.codePoints().anyMatch(Character::isISOControl)
                || value.indexOf('<') >= 0 || value.indexOf('>') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome da escola invalido");
        }
        String normalized = value.strip().replaceAll("(?U)\\s+", " ").strip();
        int length = normalized.codePointCount(0, normalized.length());
        if (length < 3 || length > 150) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome deve ter entre 3 e 150 caracteres");
        }
        return normalized;
    }

    private String normalizeProviderText(String value, int maxLength, boolean required) {
        String normalized = value == null ? null : value.strip().replaceAll("\\s+", " ");
        if (normalized != null && normalized.isEmpty()) {
            normalized = null;
        }
        if ((required && normalized == null)
                || (normalized != null && normalized.codePointCount(0, normalized.length()) > maxLength)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Endereco do CEP indisponivel");
        }
        return normalized;
    }

    @Transactional(readOnly = true)
    public List<SchoolResponse> listByEducationDepartment(Long educationDepartmentId) {
        if (educationDepartmentId == null || educationDepartmentId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID de diretoria invalido");
        }
        return repository.listByEducationDepartment(educationDepartmentId);
    }

    @Transactional(readOnly = true)
    public SchoolResponse findById(Integer id) {
        if (id == null || id <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID de escola invalido");
        }
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Unidade escolar nao encontrada"));
    }
}
