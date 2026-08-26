"use strict";

const CAPACIDADES_ADMINISTRATIVAS = Object.freeze([
  "funcionario.listar",
  "funcionario.visualizar",
  "funcionario.criar",
  "funcionario.editar",
  "funcionario.desativar",
  "funcionario.reativar",
  "ponto.hoje.visualizar",
  "ponto.resumo.visualizar",
  "relatorio.visualizar",
  "acesso.listar",
  "acesso.proprio.visualizar",
  "acesso.visualizar",
  "acesso.conceder",
  "acesso.suspender",
  "acesso.reativar",
  "acesso.revogar",
  "cargo.listar",
]);

const CAPACIDADES_SECRETARIA = Object.freeze([
  "funcionario.listar",
  "funcionario.visualizar",
  "funcionario.criar",
  "funcionario.editar",
  "ponto.hoje.visualizar",
  "ponto.resumo.visualizar",
  "relatorio.visualizar",
  "acesso.proprio.visualizar",
  "cargo.listar",
]);

const CAPACIDADES_COORDENADOR = Object.freeze([
  "funcionario.listar",
  "funcionario.visualizar",
  "ponto.hoje.visualizar",
  "ponto.resumo.visualizar",
  "relatorio.visualizar",
  "acesso.proprio.visualizar",
  "cargo.listar",
]);

// DIRETOR e VICE_DIRETOR possuem o catálogo completo. As restrições sobre
// perfis-alvo continuam exclusivamente na matriz podeConceder/podeAlterar.
const CAPACIDADES_POR_PERFIL = Object.freeze({
  ADMIN_SEDUC: CAPACIDADES_ADMINISTRATIVAS,
  ADMIN_DIRETORIA: CAPACIDADES_ADMINISTRATIVAS,
  DIRETOR: CAPACIDADES_ADMINISTRATIVAS,
  VICE_DIRETOR: CAPACIDADES_ADMINISTRATIVAS,
  SECRETARIA: CAPACIDADES_SECRETARIA,
  COORDENADOR: CAPACIDADES_COORDENADOR,
});

const CAPACIDADES_CONHECIDAS = new Set(CAPACIDADES_ADMINISTRATIVAS);
const INDICE_CAPACIDADES_POR_PERFIL = new Map(
  Object.entries(CAPACIDADES_POR_PERFIL).map(([perfil, capacidades]) => [
    perfil,
    new Set(capacidades),
  ])
);

function normalizarPerfil(perfil) {
  return typeof perfil === "string" ? perfil.trim().toUpperCase() : "";
}

function normalizarCapacidade(capacidade) {
  return typeof capacidade === "string"
    ? capacidade.trim().toLowerCase()
    : "";
}

function perfilPossuiCapacidade(perfil, capacidade) {
  const perfilNormalizado = normalizarPerfil(perfil);
  const capacidadeNormalizada = normalizarCapacidade(capacidade);

  if (!CAPACIDADES_CONHECIDAS.has(capacidadeNormalizada)) {
    return false;
  }

  const capacidadesDoPerfil = INDICE_CAPACIDADES_POR_PERFIL.get(
    perfilNormalizado
  );
  return Boolean(
    capacidadesDoPerfil && capacidadesDoPerfil.has(capacidadeNormalizada)
  );
}

function filtrarAcessosPorCapacidade(acessos, capacidade) {
  const capacidadeNormalizada = normalizarCapacidade(capacidade);
  if (
    !Array.isArray(acessos) ||
    !CAPACIDADES_CONHECIDAS.has(capacidadeNormalizada)
  ) {
    return [];
  }

  return acessos.filter(
    (acesso) =>
      acesso &&
      typeof acesso === "object" &&
      !Array.isArray(acesso) &&
      perfilPossuiCapacidade(acesso.perfil, capacidadeNormalizada)
  );
}

module.exports = {
  CAPACIDADES_ADMINISTRATIVAS,
  CAPACIDADES_POR_PERFIL,
  perfilPossuiCapacidade,
  filtrarAcessosPorCapacidade,
};
