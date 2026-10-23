package br.com.atestaponto.employee.service;

import br.com.atestaponto.employee.dto.EmployeeActivationRequest;
import br.com.atestaponto.employee.dto.EmployeeActivationResponse;
import br.com.atestaponto.employee.repository.EmployeeActivationRepository;
import jakarta.validation.Validator;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmployeeActivationService {
    private static final Set<String> CARGOS = Set.of("FUNCIONARIO", "INSPETOR", "PROFESSOR");
    private final EmployeeActivationRepository repository;
    private final Validator validator;

    public EmployeeActivationService(EmployeeActivationRepository repository, Validator validator) {
        this.repository = repository;
        this.validator = validator;
    }

    // Participa da transacao do chamador para manter os locks da autorizacao administrativa ate o commit.
    @Transactional
    public EmployeeActivationResponse changeActivation(long id, boolean active, EmployeeActivationRequest request) {
        if (id < 1 || id > 9007199254740991L || request == null || !validator.validate(request).isEmpty()) {
            throw error(HttpStatus.BAD_REQUEST, "Dados de ativacao do funcionario invalidos");
        }
        String confirmation = active ? "REATIVAR" : "DESATIVAR";
        if (!confirmation.equals(request.confirmacao())) {
            throw error(HttpStatus.BAD_REQUEST, "Confirmacao invalida. Informe " + confirmation);
        }

        boolean current = repository.lockEmployee(id)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Funcionario nao encontrado"));
        if (current == active) {
            throw error(HttpStatus.CONFLICT, active ? "Funcionario ja esta ativo" : "Funcionario ja esta inativo");
        }

        var activeLink = repository.lockActiveLink(id);
        if (active && activeLink.isPresent()) {
            throw error(HttpStatus.CONFLICT, "Funcionario inativo possui vinculo ativo; regularize o cadastro");
        }
        var link = (active ? repository.lockLatestLink(id) : activeLink)
                .orElseThrow(() -> error(HttpStatus.CONFLICT, "Vinculo de ativacao alterado ou ausente; atualize e tente novamente"));
        if (link.id() != request.vinculo_id() || link.unitId() != request.unidade_escolar_id()) {
            throw error(HttpStatus.CONFLICT, "Escopo do funcionario alterado; atualize e tente novamente");
        }
        var unit = repository.lockUnit(link.unitId())
                .orElseThrow(() -> error(HttpStatus.CONFLICT, "Unidade escolar ausente para ativacao"));
        if (!request.diretoria_ensino_id().equals(unit.departmentId())) {
            throw error(HttpStatus.CONFLICT, "Escopo da unidade alterado; atualize e tente novamente");
        }

        if (active) {
            if (!"ENCERRADO".equals(link.status())) {
                throw error(HttpStatus.CONFLICT, "Reativacao exige um vinculo anterior encerrado");
            }
            if (!unit.active()) {
                throw error(HttpStatus.CONFLICT, "Unidade escolar ausente ou inativa para reativacao");
            }
            validateSchedule(link);
        }

        requireChanged(repository.changeStatus(id, active));
        requireChanged(active ? repository.createLink(id, link) : repository.closeLink(link.id()));
        var result = repository.findStatus(id);
        if (result == null) throw new IllegalStateException("Falha ao consultar ativacao atualizada do funcionario");
        return result;
    }

    private void validateSchedule(EmployeeActivationRepository.Link link) {
        if (link.cargo() == null || !CARGOS.contains(link.cargo().trim().toUpperCase(Locale.ROOT))) {
            throw error(HttpStatus.BAD_REQUEST, "cargo invalido");
        }
        String[] times = {link.entrada(), link.saidaAlmoco(), link.retornoAlmoco(), link.saida()};
        for (String time : times) {
            if (time == null || !time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]")) {
                throw error(HttpStatus.BAD_REQUEST, "Horarios do cargo invalidos");
            }
        }
        if (!(times[0].compareTo(times[1]) < 0 && times[1].compareTo(times[2]) < 0
                && times[2].compareTo(times[3]) < 0)) {
            throw error(HttpStatus.BAD_REQUEST,
                    "Horarios devem seguir entrada < saida_almoco < retorno_almoco < saida");
        }
    }

    private void requireChanged(int affected) {
        if (affected != 1) throw new IllegalStateException("Falha ao atualizar ativacao do funcionario");
    }

    private ResponseStatusException error(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
}
