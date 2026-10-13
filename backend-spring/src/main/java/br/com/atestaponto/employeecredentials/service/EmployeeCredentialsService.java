package br.com.atestaponto.employeecredentials.service;

import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsRequest;
import br.com.atestaponto.employeecredentials.dto.EmployeeCredentialsResponse;
import br.com.atestaponto.employeecredentials.repository.EmployeeCredentialsRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmployeeCredentialsService {
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private final EmployeeCredentialsRepository repository;

    public EmployeeCredentialsService(EmployeeCredentialsRepository repository) { this.repository = repository; }

    @Transactional(readOnly = true)
    public EmployeeCredentialsResponse.Recovery recovery(EmployeeCredentialsRequest.Recovery request) {
        JsonNode cpf = request == null ? null : request.cpf();
        if (cpf == null || !cpf.isTextual() || !cpf.textValue().matches("[0-9]{11}")) {
            throw badRequest();
        }
        return new EmployeeCredentialsResponse.Recovery(
                repository.findRecoveryEmployee(cpf.textValue(), repository.hasModernLoginTable()));
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
        boolean modern = repository.hasModernLoginTable();
        var credential = repository.lockCredential(id.longValue(), modern);
        if (credential == null || !credential.active()) throw unauthorized(firstAccess);
        if (!Boolean.valueOf(firstAccess).equals(credential.firstAccess())) throw invalidState(firstAccess);
        int affected = repository.updatePassword(id.longValue(), hash.textValue(), firstAccess, modern);
        boolean updated = modern ? affected == 1 : affected >= 1 && affected <= 2;
        if (!updated) throw invalidState(firstAccess);
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
