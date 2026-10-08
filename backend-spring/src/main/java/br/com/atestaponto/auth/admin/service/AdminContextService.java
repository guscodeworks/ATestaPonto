package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import br.com.atestaponto.auth.admin.dto.AdminLoginResponse;
import br.com.atestaponto.auth.admin.repository.AdminContextRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminContextService {
    private final AdminContextRepository repository;

    public AdminContextService(AdminContextRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public AdminContextResponse read(Long adminId) {
        if (adminId == null || adminId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador administrativo invalido");
        }
        var admin = repository.findById(adminId).orElse(null);
        // Perfis, capacidades e escopo continuam sendo interpretados exclusivamente pelo Node.
        var accesses = admin == null || !admin.ativo()
                ? List.<AdminContextResponse.Access>of() : repository.findActiveAccesses(adminId);
        return new AdminContextResponse(admin, accesses);
    }

    @Transactional(readOnly = true)
    public AdminLoginResponse lookupLogin(String cpf) {
        // Preserva a comparacao original: sem trim, normalizacao ou nova regra de CPF.
        return new AdminLoginResponse(repository.findActiveByCpf(cpf).orElse(null));
    }
}
