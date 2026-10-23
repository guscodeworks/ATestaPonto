package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.adminaccess.dto.AdminAccessResponse.Resource;
import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Contrato de capacidades e delegacao de adminCapabilities.js/adminScope.js. */
public final class AdminAccessPolicy {
    public static final Set<String> SCHOOL_PROFILES = Set.of("DIRETOR", "VICE_DIRETOR", "SECRETARIA", "COORDENADOR");
    // Fonte unica no Spring; ordem publica equivalente a utils/adminCapabilities.js do gateway.
    public static final Map<String, List<String>> CAPABILITIES;
    static {
        var profiles = new LinkedHashMap<String, List<String>>();
        profiles.put("ADMIN_SEDUC", List.of(
                "diretoria.gerenciar",
                "escola.listar",
                "escola.visualizar",
                "ponto.resumo.visualizar",
                "relatorio.hierarquico.visualizar",
                "acesso.listar",
                "acesso.proprio.visualizar",
                "acesso.visualizar",
                "acesso.conceder",
                "acesso.suspender",
                "acesso.reativar",
                "acesso.revogar",
                "cargo.listar"));
        profiles.put("ADMIN_DIRETORIA", List.of(
                "escola.listar",
                "escola.visualizar",
                "funcionario.listar",
                "funcionario.visualizar",
                "funcionario.editar",
                "funcionario.desativar",
                "funcionario.reativar",
                "ponto.hoje.visualizar",
                "ponto.resumo.visualizar",
                "relatorio.visualizar",
                "relatorio.hierarquico.visualizar",
                "acesso.listar",
                "acesso.proprio.visualizar",
                "acesso.visualizar",
                "acesso.conceder",
                "acesso.suspender",
                "acesso.reativar",
                "acesso.revogar",
                "cargo.listar",
                "escola.criar"));
        profiles.put("DIRETOR", List.of(
                "escola.listar",
                "escola.visualizar",
                "funcionario.listar",
                "funcionario.visualizar",
                "funcionario.editar",
                "funcionario.desativar",
                "funcionario.reativar",
                "ponto.hoje.visualizar",
                "ponto.resumo.visualizar",
                "relatorio.visualizar",
                "relatorio.hierarquico.visualizar",
                "acesso.listar",
                "acesso.proprio.visualizar",
                "acesso.visualizar",
                "acesso.conceder",
                "acesso.suspender",
                "acesso.reativar",
                "acesso.revogar",
                "cargo.listar",
                "funcionario.criar",
                "qr.visualizar",
                "qr.gerar"));
        profiles.put("VICE_DIRETOR", List.of(
                "escola.listar",
                "escola.visualizar",
                "funcionario.listar",
                "funcionario.visualizar",
                "funcionario.editar",
                "funcionario.desativar",
                "funcionario.reativar",
                "ponto.hoje.visualizar",
                "ponto.resumo.visualizar",
                "relatorio.visualizar",
                "relatorio.hierarquico.visualizar",
                "acesso.listar",
                "acesso.proprio.visualizar",
                "acesso.visualizar",
                "acesso.conceder",
                "acesso.suspender",
                "acesso.reativar",
                "acesso.revogar",
                "cargo.listar",
                "funcionario.criar",
                "qr.visualizar",
                "qr.gerar"));
        profiles.put("SECRETARIA", List.of(
                "escola.listar",
                "escola.visualizar",
                "funcionario.listar",
                "funcionario.visualizar",
                "funcionario.criar",
                "funcionario.editar",
                "ponto.hoje.visualizar",
                "ponto.resumo.visualizar",
                "relatorio.visualizar",
                "relatorio.hierarquico.visualizar",
                "acesso.proprio.visualizar",
                "cargo.listar",
                "qr.visualizar",
                "qr.gerar"));
        profiles.put("COORDENADOR", List.of(
                "escola.listar",
                "escola.visualizar",
                "funcionario.listar",
                "funcionario.visualizar",
                "ponto.hoje.visualizar",
                "ponto.resumo.visualizar",
                "relatorio.visualizar",
                "relatorio.hierarquico.visualizar",
                "acesso.proprio.visualizar",
                "cargo.listar"));
        CAPABILITIES = java.util.Collections.unmodifiableMap(profiles);
    }
    private static final List<String> ORDER = CAPABILITIES.values().stream().flatMap(List::stream).distinct().toList();
    private AdminAccessPolicy() {}

    public static boolean permits(String profile, String capability) {
        return capability != null && CAPABILITIES.getOrDefault(profile, List.of()).contains(capability);
    }

    public static List<String> list(List<Access> accesses) {
        return ORDER.stream().filter(capability -> accesses.stream().anyMatch(a -> permits(a.perfil(), capability))).toList();
    }

    public static boolean delegates(String source, String target, boolean grant) {
        return switch (source) {
            case "ADMIN_SEDUC" -> "ADMIN_DIRETORIA".equals(target) || "SECRETARIA".equals(target)
                    || "COORDENADOR".equals(target) || (!grant && SCHOOL_PROFILES.contains(target));
            case "ADMIN_DIRETORIA" -> SCHOOL_PROFILES.contains(target);
            case "DIRETOR", "VICE_DIRETOR" -> "SECRETARIA".equals(target) || "COORDENADOR".equals(target);
            default -> false;
        };
    }

    public static boolean covers(Access access, Resource resource) {
        return "ADMIN_SEDUC".equals(access.perfil())
                || ("ADMIN_DIRETORIA".equals(access.perfil()) && access.diretoria_ensino_id() != null
                    && access.diretoria_ensino_id().equals(resource.educationDepartmentId()))
                || (SCHOOL_PROFILES.contains(access.perfil()) && access.unidade_escolar_id() != null
                    && access.unidade_escolar_id().equals(resource.schoolUnitId()));
    }

    public static Access authorizer(List<Access> accesses, String capability, String profile, Resource resource, boolean grant) {
        return accesses.stream().filter(a -> permits(a.perfil(), capability) && delegates(a.perfil(), profile, grant)
                        && covers(a, resource))
                .sorted(Comparator.<Access>comparingInt(a -> a.unidade_escolar_id() != null
                        && a.unidade_escolar_id().equals(resource.schoolUnitId()) ? 3
                        : a.diretoria_ensino_id() != null && a.diretoria_ensino_id().equals(resource.educationDepartmentId()) ? 2 : 1)
                        .reversed().thenComparingLong(Access::id))
                .findFirst().orElse(null);
    }
}
