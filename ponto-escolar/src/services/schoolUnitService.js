"use strict";

const schoolUnitModel = require("../models/schoolUnitModel");
const educationDepartmentModel = require("../models/educationDepartmentModel");
const cepService = require("./cepService");
const { buildEscopo } = require("../middlewares/adminScope");
const { filtrarAcessosPorCapacidade } = require("../utils/adminCapabilities");
const { NotFoundError } = require("../utils/errors");

// Consultas administrativas de escolas; criação e preview usam adminSchoolService.
const CAPACIDADE_CRIAR = "escola.criar";

function mapSchoolUnit(linha) {
  return {
    id: Number(linha.id),
    diretoria_ensino_id: Number(linha.diretoria_ensino_id),
    diretoria_ensino_nome: linha.diretoria_ensino_nome,
    nome: linha.nome,
    codigo_inep: linha.codigo_inep,
    endereco: linha.endereco,
    cidade: linha.cidade,
    latitude: linha.latitude === null ? null : Number(linha.latitude),
    longitude: linha.longitude === null ? null : Number(linha.longitude),
    raio_permitido_metros: Number(linha.raio_permitido_metros),
    ativa: Boolean(linha.ativa),
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
  };
}
async function listSchoolUnits(query = {}, escopoUnidades = []) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;

  const filtros = {
    escopoUnidades,
    diretoriaId: query.diretoria_ensino_id ? Number(query.diretoria_ensino_id) : undefined,
    ativa:
      query.ativa === undefined || query.ativa === ""
        ? undefined
        : query.ativa === true || query.ativa === "true" || query.ativa === "1",
    q: String(query.q || "").trim(),
  };

  const totalRow = await schoolUnitModel.countForAdmin(filtros);
  const linhas = await schoolUnitModel.listForAdmin({ ...filtros, limit, offset });

  return {
    items: linhas.map(mapSchoolUnit),
    pagination: { page, limit, total: Number(totalRow?.total || 0) },
  };
}

// O escopo da unidade já foi validado pelo middleware da rota.
async function getSchoolUnit(escolaId) {
  const linha = await schoolUnitModel.findAdminById(escolaId);
  if (!linha) {
    throw new NotFoundError("Escola nao encontrada");
  }
  return mapSchoolUnit(linha);
}

// DREs onde o administrador pode cadastrar (alimenta o seletor do formulário).
async function listDiretoriasParaCadastro(acessos) {
  const autorizadores = filtrarAcessosPorCapacidade(acessos, CAPACIDADE_CRIAR);
  const escopo = buildEscopo(autorizadores);
  if (!escopo.temAcesso) return [];

  const ativas = await educationDepartmentModel.list({ ativo: true });
  return ativas
    .filter((d) => escopo.isSeduc || escopo.diretoriasPermitidas.has(Number(d.id)))
    .map((d) => ({
      id: Number(d.id),
      nome: d.nome,
      codigo: d.codigo,
      cidade_sede: d.cidade_sede,
    }));
}

// Pré-visualização para o formulário; não grava nada. Erros (404/503/504) seguem para o cliente.
async function previewCep(cep) {
  const dados = await cepService.consultarCep(cep);
  return { ...dados, geolocalizacao_disponivel: dados.latitude !== null };
}

module.exports = {
  listSchoolUnits,
  getSchoolUnit,
  listDiretoriasParaCadastro,
  previewCep,
};
