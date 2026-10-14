"use strict";

const employmentLinkReadService = require("./employmentLinkReadService");
const schoolReadService = require("./schoolReadService");

// Consultas necessárias para resolver escopo administrativo a partir dos
// vínculos e unidades reais persistidos no banco.
async function listarUnidadesPorDiretoria(diretoriaId) {
  return schoolReadService.listByEducationDepartment(diretoriaId);
}

async function listarUnidadesParaCadastro(escopoUnidades) {
  return schoolReadService.listForRegistration(escopoUnidades);
}

async function buscarUnidadePorId(unidadeId) {
  return schoolReadService.findById(unidadeId);
}

async function buscarVinculoAtivoDoFuncionario(funcionarioId) {
  return employmentLinkReadService.findActiveByEmployeeId(
    funcionarioId
  );
}

async function buscarVinculoVisivelDoFuncionario(funcionarioId) {
  return employmentLinkReadService.findVisibleForAdminByEmployeeId(funcionarioId);
}

async function buscarVinculoMaisRecenteDoFuncionario(funcionarioId) {
  return employmentLinkReadService.findLatestByEmployeeId(
    funcionarioId
  );
}

module.exports = {
  listarUnidadesPorDiretoria,
  listarUnidadesParaCadastro,
  buscarUnidadePorId,
  buscarVinculoAtivoDoFuncionario,
  buscarVinculoVisivelDoFuncionario,
  buscarVinculoMaisRecenteDoFuncionario,
};
