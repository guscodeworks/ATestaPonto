package br.com.atestaponto.employee.service;

import br.com.atestaponto.employee.dto.EmployeeCreateRequest;
import br.com.atestaponto.employee.dto.EmployeeCreateResponse;
import br.com.atestaponto.employee.repository.EmployeeCreateRepository;
import br.com.atestaponto.validation.Cpf;
import java.util.Locale;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmployeeCreateService {
    private final EmployeeCreateRepository repository;
    private final TransactionTemplate creationTransaction;

    public EmployeeCreateService(EmployeeCreateRepository repository, PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.creationTransaction = new TransactionTemplate(transactionManager);
        this.creationTransaction.setReadOnly(false);
        this.creationTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public EmployeeCreateResponse create(EmployeeCreateRequest request) {
        return create(request, null);
    }

    /** {@code reauthorize} roda dentro da transacao, antes dos demais locks, e devolve a DRE autorizada da unidade. */
    public EmployeeCreateResponse createAuthorized(EmployeeCreateRequest request, Supplier<Long> reauthorize) {
        if (reauthorize == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Escopo da unidade invalido");
        }
        return create(request, reauthorize);
    }

    private EmployeeCreateResponse create(EmployeeCreateRequest request, Supplier<Long> reauthorize) {
        validate(request);
        try {
            return creationTransaction.execute(status -> createAtomically(request, reauthorize));
        } catch (DuplicateKeyException error) {
            // Os índices UNIQUE são a última barreira contra cadastros concorrentes.
            if (repository.existsByCpf(request.cpf())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "CPF ja cadastrado");
            }
            if (repository.existsByEmail(request.email())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Email ja cadastrado");
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conflito ao criar funcionario");
        }
    }

    private EmployeeCreateResponse createAtomically(EmployeeCreateRequest request, Supplier<Long> reauthorize) {
        // Revalida acessos e escopo sob lock do administrador antes de travar funcionario e unidade.
        Long departmentId = reauthorize == null ? null : reauthorize.get();
        if (reauthorize != null && (departmentId == null || departmentId <= 0)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Escopo da unidade invalido");
        }
        if (repository.existsByCpfForUpdate(request.cpf())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CPF ja cadastrado");
        }
        if (repository.existsByEmailForUpdate(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email ja cadastrado");
        }
        if (departmentId != null && !repository.lockAuthorizedSchoolUnit(request.unidadeEscolarId(), departmentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Escopo da unidade alterado; atualize e tente novamente");
        }
        if (departmentId == null && !repository.lockExistingSchoolUnit(request.unidadeEscolarId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unidade escolar nao encontrada");
        }

        long cargoId = repository.findOrCreateCargo(request.cargo());
        long employeeId = repository.insertEmployee(request.cpf(), request.email(), request.nome(),
                request.telefone(), request.ativo());
        repository.insertLogin(employeeId, request.senhaHash());
        long linkId = repository.insertEmploymentLink(employeeId, request.unidadeEscolarId(), cargoId,
                normalizeTime(request.entrada()), normalizeTime(request.saidaAlmoco()),
                normalizeTime(request.retornoAlmoco()), normalizeTime(request.saida()));
        if (!request.ativo()) {
            repository.closeEmploymentLink(linkId);
        }
        return repository.findCreatedEmployee(employeeId);
    }

    public void validate(EmployeeCreateRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dados do funcionario invalidos");
        }
        String cpf = request.cpf();
        if (!Cpf.valid(cpf)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CPF invalido");
        }
        if (request.email() == null || !request.email().equals(request.email().strip().toLowerCase(Locale.ROOT))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email invalido");
        }
        if (request.nome() == null || request.nome().strip().length() < 3
                || request.nome().length() > 150 // Texto ja escapado: protege a largura da coluna.
                || request.nome().codePoints().anyMatch(Character::isISOControl)
                || request.nome().contains("<") || request.nome().contains(">")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome invalido");
        }
        if (request.unidadeEscolarId() == null || request.unidadeEscolarId() < 1
                || request.unidadeEscolarId() > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unidade escolar invalida");
        }
        if (request.ativo() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status do funcionario invalido");
        }
        if (request.cargo() == null || !request.cargo().matches("FUNCIONARIO|INSPETOR|PROFESSOR")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cargo invalido");
        }
        if (!validTime(request.entrada()) || !validTime(request.saidaAlmoco())
                || !validTime(request.retornoAlmoco()) || !validTime(request.saida())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Horarios do cargo invalidos");
        }
        int entrada = timeSeconds(request.entrada());
        int saidaAlmoco = timeSeconds(request.saidaAlmoco());
        int retornoAlmoco = timeSeconds(request.retornoAlmoco());
        int saida = timeSeconds(request.saida());
        if (!(entrada < saidaAlmoco && saidaAlmoco < retornoAlmoco && retornoAlmoco < saida)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Horarios devem seguir entrada < saida_almoco < retorno_almoco < saida");
        }
        if (request.telefone() != null && !request.telefone().matches("[0-9]{1,20}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Telefone invalido");
        }
        if (request.senhaHash() == null || request.senhaHash().isBlank() || request.senhaHash().length() > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Credencial temporaria invalida");
        }
    }

    private boolean validTime(String value) {
        return value != null && value.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?");
    }

    private int timeSeconds(String value) {
        String[] parts = value.split(":");
        return Integer.parseInt(parts[0]) * 3600 + Integer.parseInt(parts[1]) * 60
                + (parts.length == 3 ? Integer.parseInt(parts[2]) : 0);
    }

    private String normalizeTime(String value) {
        return value.length() == 5 ? value + ":00" : value;
    }
}
