"use strict";

const employmentLinkModel = require("../models/employmentLinkModel");
const schoolUnitModel = require("../models/schoolUnitModel");

// Consultas necessárias para resolver escopo administrativo a partir dos
// vínculos e unidades reais persistidos no banco.
async function listarUnidadesPorDiretoria(diretoriaId) {
  return schoolUnitModel.findByDiretoriaId(diretoriaId);
}

async function buscarUnidadePorId(unidadeId) {
  return schoolUnitModel.findById(unidadeId);
}

async function buscarVinculoAtivoDoFuncionario(funcionarioId) {
  return employmentLinkModel.findActiveByFuncionarioIdWithDetails(
    funcionarioId
  );
}

async function buscarVinculoMaisRecenteDoFuncionario(funcionarioId) {
  return employmentLinkModel.findLatestByFuncionarioIdWithDetails(
    funcionarioId
  );
}

module.exports = {
  listarUnidadesPorDiretoria,
  buscarUnidadePorId,
  buscarVinculoAtivoDoFuncionario,
  buscarVinculoMaisRecenteDoFuncionario,
};
