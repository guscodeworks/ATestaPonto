package br.com.atestaponto.employee.service;

import br.com.atestaponto.employee.dto.EmployeeEditRequest;
import br.com.atestaponto.employee.dto.EmployeeEditResponse;
import br.com.atestaponto.employee.repository.EmployeeCreateRepository;
import br.com.atestaponto.employee.repository.EmployeeEditRepository;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Validator;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmployeeEditService {
    private static final Set<String> FIELDS = Set.of("nome", "email", "telefone", "cargo",
            "entrada", "saida_almoco", "retorno_almoco", "saida");
    private static final Set<String> CARGOS = Set.of("FUNCIONARIO", "INSPETOR", "PROFESSOR");
    private final EmployeeEditRepository repository;
    private final EmployeeCreateRepository cargos;
    private final Validator validator;

    public EmployeeEditService(EmployeeEditRepository repository, EmployeeCreateRepository cargos, Validator validator) {
        this.repository = repository;
        this.cargos = cargos;
        this.validator = validator;
    }

    @Transactional
    public EmployeeEditResponse update(long id, EmployeeEditRequest request) {
        if (id < 1 || id > 9007199254740991L || request == null || !validator.validate(request).isEmpty()) {
            throw error(HttpStatus.BAD_REQUEST, "Dados do funcionario invalidos");
        }
        Map<String, JsonNode> fields = request.campos();
        if (fields.isEmpty() || !FIELDS.containsAll(fields.keySet())) {
            throw error(HttpStatus.BAD_REQUEST, "Campos de atualizacao invalidos");
        }

        var employee = repository.lockEmployee(id)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Funcionario nao encontrado"));
        var link = repository.lockActiveLink(id)
                .orElseThrow(() -> error(HttpStatus.CONFLICT, "Funcionario sem vinculo ativo para editar"));
        if (link.id() != request.vinculo_id() || link.unitId() != request.unidade_escolar_id()
                || !repository.lockAuthorizedUnit(link.unitId(), request.diretoria_ensino_id())) {
            throw error(HttpStatus.CONFLICT, "Escopo do funcionario alterado; atualize e tente novamente");
        }

        String nome = text(fields, "nome", employee.nome());
        String email = text(fields, "email", employee.email()).trim().toLowerCase(Locale.ROOT);
        String telefone = text(fields, "telefone",
                employee.telefone() == null || employee.telefone().isEmpty() ? null : employee.telefone());
        if (fields.containsKey("nome")) nome = nome.trim();
        if (fields.containsKey("telefone") && telefone != null) {
            telefone = telefone.replaceAll("[^0-9]", "");
            if (telefone.isEmpty()) telefone = null;
        }
        if ((fields.containsKey("email") && !validator.validate(new EmailValue(email)).isEmpty())
                || (fields.containsKey("nome") && (nome.trim().length() < 3 || nome.length() > 150 || nome.contains("<") || nome.contains(">")))
                || (fields.containsKey("telefone") && telefone != null && !telefone.matches("[0-9]{10,11}"))) {
            throw error(HttpStatus.BAD_REQUEST, "Dados do funcionario invalidos");
        }

        String cargoValue = text(fields, "cargo", link.cargo());
        String cargo = cargoValue == null ? "" : cargoValue.trim().toUpperCase(Locale.ROOT);
        if (!CARGOS.contains(cargo)) throw error(HttpStatus.BAD_REQUEST, "cargo invalido");
        String entrada = time(text(fields, "entrada", link.entrada()));
        String saidaAlmoco = time(text(fields, "saida_almoco", link.saidaAlmoco()));
        String retornoAlmoco = time(text(fields, "retorno_almoco", link.retornoAlmoco()));
        String saida = time(text(fields, "saida", link.saida()));
        if (!(entrada.compareTo(saidaAlmoco) < 0 && saidaAlmoco.compareTo(retornoAlmoco) < 0
                && retornoAlmoco.compareTo(saida) < 0)) {
            throw error(HttpStatus.BAD_REQUEST,
                    "Horarios devem seguir entrada < saida_almoco < retorno_almoco < saida");
        }
        if (repository.emailConflict(email, id)) {
            throw error(HttpStatus.CONFLICT, "Email ja cadastrado");
        }

        long cargoId = cargos.findOrCreateCargo(cargo);
        var updated = new EmployeeEditResponse(id, nome, employee.cpf(), email, telefone, cargoId,
                cargo, entrada, saidaAlmoco, retornoAlmoco, saida);
        try {
            repository.update(updated, link.id());
        } catch (DuplicateKeyException exception) {
            // O índice UNIQUE também protege edições concorrentes do mesmo e-mail.
            throw error(HttpStatus.CONFLICT, "Email ja cadastrado");
        }
        return updated;
    }

    private record EmailValue(@NotBlank @Email @Size(max = 150) String email) {}

    private String text(Map<String, JsonNode> fields, String key, String fallback) {
        if (!fields.containsKey(key)) return fallback;
        JsonNode value = fields.get(key);
        if (key.equals("telefone") && (value == null || value.isNull())) return null;
        if (value == null || !value.isTextual()) {
            throw error(HttpStatus.BAD_REQUEST, "Campos de atualizacao invalidos");
        }
        return value.textValue();
    }

    private String time(String value) {
        String normalized = value == null ? "" : value.trim();
        if (!normalized.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?")) {
            throw error(HttpStatus.BAD_REQUEST, "Horarios do cargo invalidos");
        }
        return normalized.length() == 5 ? normalized + ":00" : normalized;
    }

    private ResponseStatusException error(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
}
