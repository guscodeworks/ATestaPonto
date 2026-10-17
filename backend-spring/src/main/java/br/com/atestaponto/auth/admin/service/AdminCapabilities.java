package br.com.atestaponto.auth.admin.service;

import br.com.atestaponto.auth.admin.dto.AdminContextResponse.Access;
import java.util.List;
import java.util.Map;

// Matriz e ordem publica equivalentes a utils/adminCapabilities.js do gateway.
public final class AdminCapabilities {
    private AdminCapabilities() {}
    private static final Map<String, List<String>> PROFILES = Map.ofEntries(
            Map.entry("ADMIN_SEDUC", List.of(
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
                    "cargo.listar")),
            Map.entry("ADMIN_DIRETORIA", List.of(
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
                    "escola.criar")),
            Map.entry("DIRETOR", List.of(
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
                    "qr.gerar")),
            Map.entry("VICE_DIRETOR", List.of(
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
                    "qr.gerar")),
            Map.entry("SECRETARIA", List.of(
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
                    "qr.gerar")),
            Map.entry("COORDENADOR", List.of(
                    "escola.listar",
                    "escola.visualizar",
                    "funcionario.listar",
                    "funcionario.visualizar",
                    "ponto.hoje.visualizar",
                    "ponto.resumo.visualizar",
                    "relatorio.visualizar",
                    "relatorio.hierarquico.visualizar",
                    "acesso.proprio.visualizar",
                    "cargo.listar")));
    private static final List<String> ORDER = java.util.stream.Stream.of(
            "ADMIN_SEDUC", "ADMIN_DIRETORIA", "DIRETOR", "VICE_DIRETOR", "SECRETARIA", "COORDENADOR")
            .flatMap(profile -> PROFILES.get(profile).stream()).distinct().toList();

    public static boolean permits(Access access, String capability) {
        return PROFILES.getOrDefault(access.perfil(), List.of()).contains(capability);
    }

    public static List<String> list(List<Access> accesses) {
        return ORDER.stream().filter(capability -> accesses.stream().anyMatch(a -> permits(a, capability))).toList();
    }
}
