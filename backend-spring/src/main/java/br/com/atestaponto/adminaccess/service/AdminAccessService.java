package br.com.atestaponto.adminaccess.service;

import br.com.atestaponto.adminaccess.dto.AdminAccessRequest;
import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.*;
import br.com.atestaponto.adminaccess.repository.AdminAccessRepository;
import br.com.atestaponto.adminaccess.repository.AdminAccessRepository.Authorizer;
import br.com.atestaponto.auth.admin.service.AdminAccessPolicy;
import br.com.atestaponto.validation.Cpf;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminAccessService {
    private final AdminAccessRepository repository;
    public AdminAccessService(AdminAccessRepository repository) { this.repository = repository; }
    private AdminAccessException bad(String message) { return new AdminAccessException(400, "BAD_REQUEST", message); }
    private AdminAccessException forbidden(String message) { return new AdminAccessException(403, "FORBIDDEN", message); }
    private AdminAccessException missing(String message) { return new AdminAccessException(404, "NOT_FOUND", message); }
    private AdminAccessException conflict(String message) { return new AdminAccessException(409, "CONFLICT", message); }

    @Transactional(readOnly = true)
    public Page list(AdminAccessRequest.ListQuery request) { return repository.list(request); }
    @Transactional(readOnly = true)
    public Access find(long id) { return repository.find(id, false); }
    @Transactional(readOnly = true)
    public Options options(AdminAccessRequest.Options request) { return repository.options(request.diretorias(), request.unidades()); }
    @Transactional(readOnly = true)
    public Resource resource(AdminAccessRequest.ResourceQuery request) {
        return resource(request.perfil(), request.diretoriaId(), request.unidadeId(), false);
    }

    private void consistent(String profile, Long department, Long school) {
        if ("ADMIN_SEDUC".equals(profile)) {
            if (department != null || school != null) throw bad("ADMIN_SEDUC nao admite diretoria_ensino_id nem unidade_escolar_id");
        } else if ("ADMIN_DIRETORIA".equals(profile)) {
            if (department == null) throw bad("diretoria_ensino_id e obrigatoria para ADMIN_DIRETORIA");
            if (school != null) throw bad("ADMIN_DIRETORIA nao admite unidade_escolar_id");
        } else if (AdminAccessPolicy.SCHOOL_PROFILES.contains(profile)) {
            if (school == null) throw bad("unidade_escolar_id e obrigatoria para perfis escolares");
            if (department != null) throw bad("Perfis escolares nao admitem diretoria_ensino_id");
        } else throw bad("perfil invalido");
    }
    private Resource resource(String profile, Long department, Long school, boolean lock) {
        consistent(profile, department, school);
        if ("ADMIN_SEDUC".equals(profile)) return new Resource(null, null);
        if ("ADMIN_DIRETORIA".equals(profile)) {
            Resource result = repository.department(department, lock);
            if (result == null) throw missing("Diretoria de ensino nao encontrada");
            return result;
        }
        Resource result = repository.school(school, lock);
        if (result == null) throw missing("Unidade escolar nao encontrada");
        return result;
    }
    private Authorizer authorizer(long id, long operator) {
        Authorizer result = repository.lockAuthorizer(id, operator);
        if (result == null) throw forbidden("Acesso autorizador nao esta mais ativo ou vigente");
        return result;
    }
    private void revalidate(Authorizer authorizer, String profile, Long department, Long school, boolean grant) {
        Resource resource;
        try { resource = resource(profile, department, school, true); }
        catch (AdminAccessException error) { throw forbidden("Escopo do acesso administrativo invalido"); }
        String source = authorizer.perfil();
        boolean delegation = AdminAccessPolicy.delegates(source, profile, grant);
        boolean scope = "ADMIN_SEDUC".equals(source)
                || ("ADMIN_DIRETORIA".equals(source) && authorizer.diretoriaId() != null
                    && authorizer.diretoriaId().equals(resource.educationDepartmentId()))
                || (AdminAccessPolicy.SCHOOL_PROFILES.contains(source) && authorizer.unidadeId() != null
                    && authorizer.unidadeId().equals(resource.schoolUnitId()));
        if (!delegation || !scope) throw forbidden("Acesso autorizador sem capacidade ou escopo suficiente");
    }

    @Transactional
    public Granted grant(AdminAccessRequest.Grant request) {
        consistent(request.perfil(), request.diretoriaId(), request.unidadeId());
        if (!Cpf.valid(request.cpf())) throw bad("CPF invalido");
        if (request.dataInicio() != null && request.dataFim() != null && request.dataFim().isBefore(request.dataInicio())) {
            throw bad("data_fim deve ser posterior ou igual a data_inicio");
        }
        Authorizer authorizer = authorizer(request.acessoAutorizadorId(), request.adminId());
        revalidate(authorizer, request.perfil(), request.diretoriaId(), request.unidadeId(), true);
        Long user = repository.findActiveUser(request.cpf());
        boolean created = user == null;
        if (created) {
            if (request.nome() == null || request.nome().isBlank()) throw bad("nome e obrigatorio para novo usuario administrativo");
            user = repository.createUser(request.cpf(), request.nome(), request.email());
        }
        long id = repository.grant(user, request);
        Access result = repository.find(id, false);
        if (result == null) throw new IllegalStateException("Falha ao obter o acesso criado");
        return new Granted(result, created);
    }

    @Transactional
    public Access change(AdminAccessRequest.Change request) {
        Authorizer authorizer = authorizer(request.acessoAutorizadorId(), request.adminId());
        Access target = repository.find(request.acessoId(), true);
        if (target == null) throw missing("Acesso administrativo nao encontrado");
        if (target.usuario_administrativo_id() == request.adminId()) throw forbidden("Nao e permitido alterar o proprio acesso");
        revalidate(authorizer, target.perfil(), target.diretoria_ensino_id(), target.unidade_escolar_id(), false);
        String next = switch (request.acao()) {
            case "suspender" -> "SUSPENSO";
            case "reativar" -> "ATIVO";
            case "revogar" -> "REVOGADO";
            default -> throw bad("acao de status invalida");
        };
        if (!target.status().equals(request.statusAtual())) {
            throw conflict("Status do acesso foi alterado por outra operacao; atualize e tente novamente");
        }
        boolean permitted = "suspender".equals(request.acao()) ? "ATIVO".equals(target.status())
                : "reativar".equals(request.acao()) ? "SUSPENSO".equals(target.status())
                : Set.of("ATIVO", "SUSPENSO").contains(target.status());
        if (!permitted) {
            if ("REVOGADO".equals(target.status()) && !"REVOGADO".equals(next)) {
                throw conflict("Acesso REVOGADO e definitivo: nao pode ser reativado");
            }
            throw conflict("Transicao invalida de " + target.status() + " para " + next);
        }
        if (repository.changeStatus(target.id(), target.status(), next) != 1) {
            throw conflict("Status do acesso foi alterado por outra operacao; atualize e tente novamente");
        }
        Access result = repository.find(target.id(), false);
        if (result == null) throw new IllegalStateException("Falha ao obter o acesso atualizado");
        return result;
    }
}
