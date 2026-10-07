package br.com.atestaponto.adminidentity.service;

import br.com.atestaponto.adminidentity.dto.AdminIdentityResponse;
import br.com.atestaponto.adminidentity.repository.AdminIdentityRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminIdentityService {
    private final AdminIdentityRepository repository;

    public AdminIdentityService(AdminIdentityRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public AdminIdentityResponse read(long adminId) {
        if (adminId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador administrativo invalido");
        }
        var admin = repository.findById(adminId).orElse(null);
        // Perfis, capacidades e escopo continuam sendo interpretados exclusivamente pelo Node.
        var accesses = admin == null || !admin.ativo()
                ? List.<AdminIdentityResponse.Access>of() : repository.findActiveAccesses(adminId);
        return new AdminIdentityResponse(admin, accesses);
    }
}
