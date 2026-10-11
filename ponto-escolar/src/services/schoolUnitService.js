"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const schoolUnitModel = require("../models/schoolUnitModel");
const educationDepartmentService = require("./educationDepartmentService");
const cepService = require("./cepService");
const { buildEscopo } = require("../middlewares/adminScope");
const { filtrarAcessosPorCapacidade } = require("../utils/adminCapabilities");
const { AppError, NotFoundError } = require("../utils/errors");

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
  const ids = escopoUnidades === null ? null : Array.isArray(escopoUnidades)
    ? [...new Set(escopoUnidades.map(Number))].filter(id => Number.isSafeInteger(id) && id > 0)
    : [];
  if (ids !== null && ids.length === 0) {
    return { items: [], pagination: { page, limit, total: 0 } };
  }
  const diretoriaId = Number(query.diretoria_ensino_id);
  try {
    const response = await requestSpring("/internal/escolas/listagem", {
      method: "POST",
      body: {
        escopo_global: ids === null,
        unidades_escolares_ids: ids || [],
        diretoria_ensino_id: Number.isSafeInteger(diretoriaId) && diretoriaId > 0 ? diretoriaId : null,
        ativa: query.ativa === undefined || query.ativa === "" ? null
          : query.ativa === true || query.ativa === "true" || query.ativa === "1",
        q: String(query.q || "").trim(),
        page,
        limit,
      },
    });
    if (response.status !== 200) throw new Error("Falha na listagem interna");
    const result = await response.json();
    return { items: result.items.map(mapSchoolUnit), pagination: result.pagination };
  } catch (_error) {
    throw new AppError("Servico de escolas indisponivel", {
      statusCode: 502,
      code: "SCHOOL_SERVICE_UNAVAILABLE",
    });
  }
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
  const autorizadores = filtrarAcessosPorCapacidade(
    acessos,
    CAPACIDADE_CRIAR
  );

  const escopo = buildEscopo(autorizadores);

  if (!escopo.temAcesso) {
    return [];
  }

  const response = await educationDepartmentService.list(true);

  if (response.status !== 200) {
    throw new AppError("Servico de diretorias indisponivel", {
      statusCode: 502,
      code: "EDUCATION_DEPARTMENT_SERVICE_UNAVAILABLE",
    });
  }

  const ativas = Array.isArray(response.body)
    ? response.body
    : [];

  return ativas
    .filter(
      (d) =>
        escopo.isSeduc ||
        escopo.diretoriasPermitidas.has(Number(d.id))
    )
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
