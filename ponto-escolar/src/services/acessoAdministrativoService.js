"use strict";

const acessoAdministrativoModel = require("../models/acessoAdministrativoModel");
const usuarioAdministrativoModel = require("../models/usuarioAdministrativoModel");
const diretoriaEnsinoModel = require("../models/diretoriaEnsinoModel");
const unidadeEscolarModel = require("../models/unidadeEscolarModel");
const {
  PERFIL_SEDUC,
  PERFIL_DIRETORIA,
  PERFIS_ESCOLARES,
  buildEscopo,
  recursoNoEscopo,
  podeConceder,
} = require("../middlewares/adminScope");
const { registerAuditLog } = require("./auditLogService");
const { maskCpf, normalizeCpf } = require("../utils/cpf");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../utils/errors");

// Converte Data/string de validador (isISO8601 → Date) para 'YYYY-MM-DD',
// alinhado ao timezone 'Z' do pool. null/inválido → null.
function toDateString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Máscara de saída: CPF/email sensível nunca exposto em claro.
function mapAcesso(acesso, extras = {}) {
  return {
    id: Number(acesso.id),
    usuario_administrativo_id: Number(acesso.usuario_administrativo_id),
    perfil: acesso.perfil,
    diretoria_ensino_id:
      acesso.diretoria_ensino_id != null
        ? Number(acesso.diretoria_ensino_id)
        : null,
    diretoria_ensino_nome: acesso.diretoria_ensino_nome || null,
    unidade_escolar_id:
      acesso.unidade_escolar_id != null
        ? Number(acesso.unidade_escolar_id)
        : null,
    unidade_escolar_nome: acesso.unidade_escolar_nome || null,
    status: acesso.status,
    data_inicio: toDateString(acesso.data_inicio),
    data_fim: toDateString(acesso.data_fim),
    concedido_por_acesso_id:
      acesso.concedido_por_acesso_id != null
        ? Number(acesso.concedido_por_acesso_id)
        : null,
    criado_em: acesso.criado_em,
    atualizado_em: acesso.atualizado_em,
    usuario: {
      cpf: maskCpf(acesso.usuario_cpf),
      nome: acesso.usuario_nome,
      email: acesso.usuario_email,
      ativo: Boolean(acesso.usuario_ativo),
    },
    ...extras,
  };
}

// Valida consistência perfil <-> diretoria/unidade (defense-in-depth; o DB
// enforça via chk_acessos_escopo, mas rejeita cedo com a mensagem de negócio).
function validarConsistenciaPerfil(perfil, diretoriaId, unidadeId) {
  if (perfil === PERFIL_SEDUC) {
    if (diretoriaId || unidadeId) {
      throw new BadRequestError(
        "ADMIN_SEDUC nao admite diretoria_ensino_id nem unidade_escolar_id"
      );
    }
    return;
  }
  if (perfil === PERFIL_DIRETORIA) {
    if (!diretoriaId) {
      throw new BadRequestError(
        "diretoria_ensino_id e obrigatoria para ADMIN_DIRETORIA"
      );
    }
    if (unidadeId) {
      throw new BadRequestError(
        "ADMIN_DIRETORIA nao admite unidade_escolar_id"
      );
    }
    return;
  }
  if (PERFIS_ESCOLARES.has(perfil)) {
    if (!unidadeId) {
      throw new BadRequestError(
        "unidade_escolar_id e obrigatoria para perfis escolares"
      );
    }
    if (diretoriaId) {
      throw new BadRequestError(
        "Perfis escolares nao admitem diretoria_ensino_id"
      );
    }
    return;
  }
  throw new BadRequestError("perfil invalido");
}

// Coleta os perfis individuais do concedente a partir de seus acessos ativos.
// Necessário porque buildEscopo colapsa os perfis escolares em unidadesPermitidas,
// descartando qual perfil escolar exato o concedente possui — a matriz de
// delegação precisa dessa distinção (DIRETOR vs SECRETARIA, p.ex.).
function perfisDoConcedente(acessos) {
  const lista = Array.isArray(acessos) ? acessos : [];
  const perfis = new Set();
  for (const acesso of lista) {
    const perfil = String((acesso && acesso.perfil) || "").trim().toUpperCase();
    if (perfil) {
      perfis.add(perfil);
    }
  }
  return perfis;
}

// Autoriza concessão combinando duas dimensões independentes:
//   1) Matriz de delegação (perfil-a-perfil): algum acesso do concedente cobre
//      o perfil-alvo pela matriz (podeConceder). Anti-escalada é implícita aqui
//      — ninguém concede perfil igual/acima do próprio nível (ver adminScope).
//   2) Escopo do recurso (recursoNoEscopo, inalterado): a diretoria/unidade
//      alvo precisa estar dentro do escopo do concedente.
// A matriz é pré-filtro; a checagem de escopo existente é preservada.
async function autorizarConcessao(perfil, diretoriaId, unidadeId, escopo, acessos) {
  const perfis = perfisDoConcedente(acessos);
  const concedidoPorMatriz = Array.from(perfis).some((p) => podeConceder(p, perfil));
  if (!concedidoPorMatriz) {
    throw new ForbiddenError(
      "Perfil do administrador nao permite conceder este perfil"
    );
  }

  if (perfil === PERFIL_SEDUC) {
    if (!escopo || !escopo.isSeduc) {
      throw new ForbiddenError("Apenas ADMIN_SEDUC pode conceder acesso SEDUC");
    }
    return;
  }

  if (perfil === PERFIL_DIRETORIA) {
    const diretoria = await diretoriaEnsinoModel.findById(diretoriaId);
    if (!diretoria) {
      throw new NotFoundError("Diretoria de ensino nao encontrada");
    }
    if (!recursoNoEscopo(escopo, { diretoriaEnsinoId: diretoriaId })) {
      throw new ForbiddenError(
        "Diretoria de ensino fora do escopo do administrador"
      );
    }
    return;
  }

  // PERFIS_ESCOLARES
  const unidade = await unidadeEscolarModel.findById(unidadeId);
  if (!unidade) {
    throw new NotFoundError("Unidade escolar nao encontrada");
  }
  if (
    !recursoNoEscopo(escopo, {
      unidadeEscolarId: unidade.id,
      diretoriaEnsinoId: unidade.diretoria_ensino_id,
    })
  ) {
    throw new ForbiddenError(
      "Unidade escolar fora do escopo do administrador"
    );
  }
}

// O acesso que autoriza a concessão: primeiro acesso do concedente cujo
// escopo cobre o escopo concedido (self-FK concedido_por_acesso_id).
function resolverConcedente(acessos, { diretoriaEnsinoId, unidadeEscolarId }) {
  const lista = Array.isArray(acessos) ? acessos : [];
  for (const acesso of lista) {
    const escopoAcesso = buildEscopo([acesso]);
    if (
      escopoAcesso.temAcesso &&
      recursoNoEscopo(escopoAcesso, { diretoriaEnsinoId, unidadeEscolarId })
    ) {
      return Number(acesso.id);
    }
  }
  return null;
}

/**
 * Concede um acesso administrativo. Cria a identidade admin (find-or-create)
 * e o acesso na mesma transação; audita a concessão.
 */
async function createAcesso(body, { adminId, ipOrigem, escopo, acessos } = {}) {
  const cpf = normalizeCpf(body && body.cpf);
  if (!cpf) {
    throw new BadRequestError("CPF e obrigatorio");
  }

  const perfil = String((body && body.perfil) || "").trim().toUpperCase();
  const diretoriaId = body && body.diretoria_ensino_id
    ? Number(body.diretoria_ensino_id)
    : null;
  const unidadeId = body && body.unidade_escolar_id
    ? Number(body.unidade_escolar_id)
    : null;

  validarConsistenciaPerfil(perfil, diretoriaId, unidadeId);

  const dataInicio = toDateString(body && body.data_inicio);
  const dataFim = toDateString(body && body.data_fim);
  if (dataInicio && dataFim && dataFim < dataInicio) {
    // DB também rejeita via chk_acessos_periodo; rejeita cedo com msg de negócio.
    throw new BadRequestError("data_fim deve ser posterior ou igual a data_inicio");
  }

  // O ato de conceder ativa; sem endpoint de flip de status neste escopo, um
  // grant PENDENTE nunca surtiria efeito (findAcessosAtivosPorUsuario só honra ATIVO).
  const status = String((body && body.status) || "ATIVO")
    .trim()
    .toUpperCase();
  if (!["ATIVO", "SUSPENSO"].includes(status)) {
    throw new BadRequestError("status invalido");
  }

  await autorizarConcessao(perfil, diretoriaId, unidadeId, escopo, acessos);
  const concedidoPorAcessoId = resolverConcedente(acessos, {
    diretoriaEnsinoId: diretoriaId,
    unidadeEscolarId: unidadeId,
  });

  const nome = body && body.nome !== undefined ? String(body.nome).trim() : null;
  const email =
    body && body.email !== undefined
      ? String(body.email).trim().toLowerCase()
      : null;

  const { acessoId, criouIdentidade } =
    await acessoAdministrativoModel.withTransaction(async (tx) => {
      let usuario = await usuarioAdministrativoModel.findByCpf(cpf, tx);
      let criouIdentidadeFlag = false;

      if (!usuario) {
        // find-or-create da identidade admin (keyed por cpf próprio).
        if (!nome) {
          throw new BadRequestError(
            "nome e obrigatorio para novo usuario administrativo"
          );
        }
        await usuarioAdministrativoModel.create(tx, {
          cpf,
          nome,
          email,
          ativo: true,
        });
        usuario = await usuarioAdministrativoModel.findByCpf(cpf, tx);
        if (!usuario) {
          throw new Error("Falha ao obter o usuario administrativo criado");
        }
        criouIdentidadeFlag = true;
      }

      const usuarioAdministrativoId = Number(usuario.id);
      const insert = await acessoAdministrativoModel.createAcesso(tx, {
        usuarioAdministrativoId,
        perfil,
        diretoriaEnsinoId: diretoriaId,
        unidadeEscolarId: unidadeId,
        status,
        dataInicio,
        dataFim,
        concedidoPorAcessoId,
      });
      const acessoIdNum = Number(insert.insertId);
      if (!Number.isInteger(acessoIdNum) || acessoIdNum < 1) {
        throw new Error("Falha ao obter o ID do acesso criado");
      }

      return { acessoId: acessoIdNum, criouIdentidade: criouIdentidadeFlag };
    });

  const acesso = await acessoAdministrativoModel.findById(acessoId);

  await registerAuditLog({
    evento: "acesso_administrativo_concedido",
    adminId,
    mensagem: "Concessao de acesso administrativo",
    ipOrigem,
    metadados: {
      acesso_id: acessoId,
      usuario_administrativo_id: acesso ? acesso.usuario_administrativo_id : null,
      perfil,
      diretoria_ensino_id: diretoriaId,
      unidade_escolar_id: unidadeId,
      status,
      criou_identidade: criouIdentidade,
    },
  });

  return {
    acesso: mapAcesso(acesso || { id: acessoId, usuario_administrativo_id: null }, {
      criou_identidade: criouIdentidade,
    }),
  };
}

/**
 * Lista acessos no escopo do administrador, paginado.
 */
async function listAcessos(query = {}, { escopo, escopoUnidades } = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;

  const total = await acessoAdministrativoModel.countAcessos({
    escopo,
    escopoUnidades,
  });
  const rows = await acessoAdministrativoModel.listAcessos({
    escopo,
    escopoUnidades,
    limit,
    offset,
  });

  return {
    items: rows.map((row) => mapAcesso(row)),
    pagination: { page, limit, total: Number(total) },
  };
}

/**
 * Obtém um acesso por id, respeitando o escopo do administrador.
 */
async function getAcesso(acessoId, { escopo } = {}) {
  const acesso = await acessoAdministrativoModel.findById(acessoId);
  if (!acesso) {
    throw new NotFoundError("Acesso administrativo nao encontrado");
  }
  const autorizado = recursoNoEscopo(escopo, {
    diretoriaEnsinoId: acesso.diretoria_ensino_id,
    unidadeEscolarId: acesso.unidade_escolar_id,
  });
  if (!autorizado) {
    throw new ForbiddenError(
      "Acesso administrativo fora do escopo do administrador"
    );
  }
  return { acesso: mapAcesso(acesso) };
}

module.exports = {
  createAcesso,
  listAcessos,
  getAcesso,
};
