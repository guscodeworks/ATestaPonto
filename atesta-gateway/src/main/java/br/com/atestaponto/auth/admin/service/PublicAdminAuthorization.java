package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicAdminAuthorization {
    private final AdminContextService admins;

    public PublicAdminAuthorization(AdminContextService admins) {
        this.admins = admins;
    }

    public AdminContextResponse requireActive(long id) {
        return requireValid(admins.read(id), id);
    }

    public AdminContextResponse requireApiSession(long id) {
        var context = admins.read(id);
        if (context.admin() == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Administrativo nao encontrado no sistema");
        if (!context.admin().ativo()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrativo inativo");
        if (context.acessos().isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrativo sem acessos administrativos ativos");
        return requireValid(context, id);
    }

    public AdminContextResponse requireActiveForUpdate(long id) {
        return requireValid(admins.readForUpdate(id), id);
    }

    private AdminContextResponse requireValid(AdminContextResponse context, long id) {
        if (context.admin() == null || !context.admin().ativo() || context.acessos().isEmpty()
                || context.acessos().stream().anyMatch(access -> !validAccess(access, id))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso administrativo indisponivel");
        }
        return context;
    }

    private boolean validAccess(AdminContextResponse.Access access, long id) {
        if (access.id() <= 0 || access.perfil() == null || access.usuario_administrativo_id() != id
                || !"ATIVO".equals(access.status())) return false;
        // A vigencia usa CURRENT_DATE no repository, sem reinterpretar no fuso da JVM.
        return switch (access.perfil()) {
            case "ADMIN_SEDUC" -> access.diretoria_ensino_id() == null && access.unidade_escolar_id() == null;
            case "ADMIN_DIRETORIA" -> positive(access.diretoria_ensino_id()) && access.unidade_escolar_id() == null;
            case "DIRETOR", "VICE_DIRETOR", "SECRETARIA", "COORDENADOR" ->
                access.diretoria_ensino_id() == null && positive(access.unidade_escolar_id());
            default -> false;
        };
    }

    private boolean positive(Long id) { return id != null && id > 0; }
}
