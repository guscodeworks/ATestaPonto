package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminPageAuthorization {
    private final PublicReportAuthorization scopes;

    public AdminPageAuthorization(PublicReportAuthorization scopes) {
        this.scopes = scopes;
    }

    public void require(AdminContextResponse admin, String capability) {
        // O contexto vem da revalidacao da sessao Redis no filtro, nunca do navegador.
        if (admin == null || admin.admin() == null || !admin.admin().ativo()
                || admin.acessos() == null || admin.acessos().isEmpty()) throw denied();
        if (capability == null) return;
        if ("diretoria.gerenciar".equals(capability)) {
            if (admin.acessos().stream().noneMatch(a -> AdminCapabilities.permits(a, capability))) throw denied();
            return;
        }
        var scope = scopes.authorize(admin, capability);
        // Criar a primeira escola exige DRE autorizada, mesmo sem unidades existentes.
        if (!scope.global() && scope.schools().isEmpty()
                && !("escola.criar".equals(capability) && !scope.departments().isEmpty())) throw denied();
    }

    private static ResponseStatusException denied() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "Pagina fora do escopo administrativo");
    }
}
