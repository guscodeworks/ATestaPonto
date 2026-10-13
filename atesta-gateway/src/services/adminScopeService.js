"use strict";

const employmentLinkModel = require("../models/employmentLinkModel");
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
  return employmentLinkModel.findActiveByFuncionarioIdWithDetails(
    funcionarioId
  );
}

async function buscarVinculoVisivelDoFuncionario(funcionarioId) {
  return employmentLinkModel.findForAdminEmployeeView(funcionarioId);
}

async function buscarVinculoMaisRecenteDoFuncionario(funcionarioId) {
  return employmentLinkModel.findLatestByFuncionarioIdWithDetails(
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
