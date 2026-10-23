package br.com.atestaponto.employeecredentials.service;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest;
import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmployeeCredentialsService {
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private final EmployeeCredentialsRepository repository;

    public EmployeeCredentialsService(EmployeeCredentialsRepository repository) { this.repository = repository; }

    @Transactional(readOnly = true)
    public EmployeeCredentialsResponse.Authentication login(EmployeeCredentialsRequest.Login request) {
        JsonNode cpf = request == null ? null : request.cpf();
        JsonNode email = request == null ? null : request.email();
        boolean hasCpf = cpf != null && !cpf.isNull();
        boolean hasEmail = email != null && !email.isNull();
        if (hasCpf == hasEmail
                || (hasCpf && (!cpf.isTextual() || !cpf.textValue().matches("[0-9]{11}")))
                || (hasEmail && (!email.isTextual() || !email.textValue().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")))) {
            throw badRequest();
        }
        return new EmployeeCredentialsResponse.Authentication(repository.findLoginEmployee(
                hasCpf ? cpf.textValue() : null,
                hasEmail ? email.textValue().toLowerCase(Locale.ROOT) : null));
    }

    @Transactional(readOnly = true)
    public EmployeeCredentialsResponse.Authentication tokenValidation(EmployeeCredentialsRequest.EmployeeId request) {
        long id = employeeId(request);
        return new EmployeeCredentialsResponse.Authentication(repository.findTokenEmployee(id));
    }

    @Transactional(readOnly = true)
    public EmployeeCredentialsResponse.LoginLink activeLink(EmployeeCredentialsRequest.EmployeeId request) {
        long id = employeeId(request);
        // modern permanece no contrato /internal consumido pelo gateway; o schema legado nao e mais suportado.
        return new EmployeeCredentialsResponse.LoginLink(true, repository.findActiveLink(id));
    }

    private long employeeId(EmployeeCredentialsRequest.EmployeeId request) {
        JsonNode id = request == null ? null : request.funcionario_id();
        if (id == null || !id.isIntegralNumber() || !id.canConvertToLong()
                || id.longValue() < 1 || id.longValue() > MAX_SAFE_INTEGER) throw badRequest();
        return id.longValue();
    }

    @Transactional(readOnly = false, propagation = Propagation.REQUIRES_NEW)
    public EmployeeCredentialsResponse.Change lastLogin(EmployeeCredentialsRequest.EmployeeId request) {
        long id = employeeId(request);
        if (repository.updateLastLogin(id) != 1) {
            throw new EmployeeCredentialsException(401, "UNAUTHORIZED", "CPF/email ou senha invalidos");
        }
        return new EmployeeCredentialsResponse.Change(true);
    }

    @Transactional(readOnly = true)
    public EmployeeCredentialsResponse.Recovery recovery(EmployeeCredentialsRequest.Recovery request) {
        JsonNode cpf = request == null ? null : request.cpf();
        if (cpf == null || !cpf.isTextual() || !cpf.textValue().matches("[0-9]{11}")) {
            throw badRequest();
        }
        return new EmployeeCredentialsResponse.Recovery(repository.findRecoveryEmployee(cpf.textValue()));
    }

    @Transactional
    public EmployeeCredentialsResponse.Change firstAccess(EmployeeCredentialsRequest.Change request) {
        return change(request, true);
    }

    @Transactional
    public EmployeeCredentialsResponse.Change resetPassword(EmployeeCredentialsRequest.Change request) {
        return change(request, false);
    }

    private EmployeeCredentialsResponse.Change change(EmployeeCredentialsRequest.Change request, boolean firstAccess) {
        JsonNode id = request == null ? null : request.funcionario_id();
        JsonNode hash = request == null ? null : request.senha_hash();
        if (id == null || !id.isIntegralNumber() || !id.canConvertToLong()
                || id.longValue() < 1 || id.longValue() > MAX_SAFE_INTEGER
                || hash == null || !hash.isTextual()
                || !hash.textValue().matches("\\$2[ab]\\$(0[4-9]|[12][0-9]|3[01])\\$[./A-Za-z0-9]{53}")) {
            throw badRequest();
        }
        var credential = repository.lockCredential(id.longValue());
        if (credential == null || !credential.active()) throw unauthorized(firstAccess);
        if (!Boolean.valueOf(firstAccess).equals(credential.firstAccess())) throw invalidState(firstAccess);
        if (repository.updatePassword(id.longValue(), hash.textValue(), firstAccess) != 1) throw invalidState(firstAccess);
        return new EmployeeCredentialsResponse.Change(true);
    }

    private EmployeeCredentialsException badRequest() {
        return new EmployeeCredentialsException(400, "BAD_REQUEST", "Requisicao de credenciais invalida");
    }

    private EmployeeCredentialsException unauthorized(boolean firstAccess) {
        return new EmployeeCredentialsException(401, "UNAUTHORIZED", firstAccess
                ? "Comprovante de primeiro acesso invalido" : "Nao foi possivel redefinir a senha.");
    }

    private EmployeeCredentialsException invalidState(boolean firstAccess) {
        return firstAccess ? new EmployeeCredentialsException(409, "CONFLICT", "O primeiro acesso ja foi concluido")
                : unauthorized(false);
    }
}
