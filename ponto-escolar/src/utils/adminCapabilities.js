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

const CAPACIDADES_QR_ESCOLAR = Object.freeze([
  "qr.visualizar",
  "qr.gerar",
]);

const CAPACIDADES_DIRECAO = Object.freeze([
  ...CAPACIDADES_ADMINISTRATIVAS,
  ...CAPACIDADES_QR_ESCOLAR,
]);

const CAPACIDADES_SECRETARIA_COM_QR = Object.freeze([
  ...CAPACIDADES_SECRETARIA,
  ...CAPACIDADES_QR_ESCOLAR,
]);

// QR é administrado apenas por perfis escolares com uma unidade própria.
const CAPACIDADES_POR_PERFIL = Object.freeze({
  ADMIN_SEDUC: CAPACIDADES_ADMINISTRATIVAS,
  ADMIN_DIRETORIA: CAPACIDADES_ADMINISTRATIVAS,
  DIRETOR: CAPACIDADES_DIRECAO,
  VICE_DIRETOR: CAPACIDADES_DIRECAO,
  SECRETARIA: CAPACIDADES_SECRETARIA_COM_QR,
  COORDENADOR: CAPACIDADES_COORDENADOR,
});

const CAPACIDADES_CONHECIDAS = new Set(
  Object.values(CAPACIDADES_POR_PERFIL).flat()
);
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
