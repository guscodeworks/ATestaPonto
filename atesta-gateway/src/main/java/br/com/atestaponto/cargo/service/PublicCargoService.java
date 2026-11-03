package br.com.atestaponto.cargo.service;

import br.com.atestaponto.adminaccess.service.AdminAccessException;
import br.com.atestaponto.auth.admin.service.AdminAccessPolicy;
import br.com.atestaponto.auth.admin.service.PublicAdminAuthorization;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicCargoService {
    private final CargoReadService cargos;
    private final PublicAdminAuthorization admins;
    public PublicCargoService(CargoReadService cargos, PublicAdminAuthorization admins) { this.cargos = cargos; this.admins = admins; }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(long adminId) {
        if (admins.requireActive(adminId).acessos().stream().noneMatch(a -> AdminAccessPolicy.permits(a.perfil(), "cargo.listar"))) {
            throw new AdminAccessException(403, "FORBIDDEN", "Capacidade administrativa insuficiente");
        }
        return cargos.list().stream().map(c -> Map.<String, Object>of("id", c.id(), "nome", c.cargo(), "ativo", c.ativo())).toList();
    }
}
