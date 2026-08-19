"use strict";

const adminAccessModel = require("../models/adminAccessModel");
const adminUserModel = require("../models/adminUserModel");
const educationDepartmentModel = require("../models/educationDepartmentModel");
const schoolUnitModel = require("../models/schoolUnitModel");
const {
  PERFIL_SEDUC,
  PERFIL_DIRETORIA,
  PERFIS_ESCOLARES,
  buildEscopo,
  recursoNoEscopo,
  podeConceder,
  podeAlterar,
} = require("../middlewares/adminScope");
const { registerAuditLog } = require("./auditLogService");
const { maskCpf, normalizeCpf } = require("../utils/cpf");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../utils/errors");

// Converte Date/string p/ 'YYYY-MM-DD' no timezone 'Z' do pool. null/inválido → null.
function toDateString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Saída mascarada: CPF nunca exposto em claro.
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

// /meu: origem é select básico sem JOINs/dados de terceiros → sem bloco `usuario`
// nem nomes. Leitura pura, sem DB extra.
function mapMeuAcesso(acesso) {
  return {
    id: Number(acesso.id),
    perfil: acesso.perfil,
    diretoria_ensino_id:
      acesso.diretoria_ensino_id != null
        ? Number(acesso.diretoria_ensino_id)
        : null,
    unidade_escolar_id:
      acesso.unidade_escolar_id != null
        ? Number(acesso.unidade_escolar_id)
        : null,
    status: acesso.status,
    data_inicio: toDateString(acesso.data_inicio),
    data_fim: toDateString(acesso.data_fim),
    concedido_por_acesso_id:
      acesso.concedido_por_acesso_id != null
        ? Number(acesso.concedido_por_acesso_id)
        : null,
    criado_em: acesso.criado_em,
    atualizado_em: acesso.atualizado_em,
  };
}

// Serializa escopo p/ JSON: Sets → arrays ordenados (ints). Reusa o que o
// escopoMiddleware já resolveu (buildEscopo).
function resumirEscopo(escopo) {
  if (!escopo) {
    return {
      isSeduc: false,
      diretoriasPermitidas: [],
      unidadesPermitidas: [],
      temAcesso: false,
    };
  }
  const toSortedNums = (set) =>
    [...set]
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
  return {
    isSeduc: Boolean(escopo.isSeduc),
    diretoriasPermitidas: toSortedNums(escopo.diretoriasPermitidas),
    unidadesPermitidas: toSortedNums(escopo.unidadesPermitidas),
    temAcesso: Boolean(escopo.temAcesso),
  };
}

// Defense-in-depth: o DB enforça via chk_acessos_escopo, mas rejeita cedo com
// a mensagem de negócio.
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

// buildEscopo colapsa perfis escolares em unidadesPermitidas, descartando qual
// perfil exato o concedente tem — a matriz de delegação precisa dessa distinção.
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

// Concessão combina duas dimensões: (1) matriz de delegação (podeConceder —
// anti-escalada implícita, ninguém concede nível >= ao seu) e (2) escopo do
// recurso (recursoNoEscopo). Matriz = pré-filtro; escopo é a checagem existente.
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
    const diretoria = await educationDepartmentModel.findById(diretoriaId);
    if (!diretoria) {
      throw new NotFoundError("Diretoria de ensino nao encontrada");
    }
    if (!recursoNoEscopo(escopo, { educationDepartmentId: diretoriaId })) {
      throw new ForbiddenError(
        "Diretoria de ensino fora do escopo do administrador"
      );
    }
    return;
  }

  // PERFIS_ESCOLARES
  const unidade = await schoolUnitModel.findById(unidadeId);
  if (!unidade) {
    throw new NotFoundError("Unidade escolar nao encontrada");
  }
  if (
    !recursoNoEscopo(escopo, {
      schoolUnitId: unidade.id,
      educationDepartmentId: unidade.diretoria_ensino_id,
    })
  ) {
    throw new ForbiddenError(
      "Unidade escolar fora do escopo do administrador"
    );
  }
}

// O acesso concedente: primeiro do concedente cujo escopo cobre o concedido
// (self-FK concedido_por_acesso_id).
function resolverConcedente(acessos, { educationDepartmentId, schoolUnitId }) {
  const lista = Array.isArray(acessos) ? acessos : [];
  for (const acesso of lista) {
    const escopoAcesso = buildEscopo([acesso]);
    if (
      escopoAcesso.temAcesso &&
      recursoNoEscopo(escopoAcesso, { educationDepartmentId, schoolUnitId })
    ) {
      return Number(acesso.id);
    }
  }
  return null;
}

// Concessão: find-or-create da identidade admin + acesso na mesma transação.
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
    // DB rejeita via chk_acessos_periodo; rejeita cedo com a msg de negócio.
    throw new BadRequestError("data_fim deve ser posterior ou igual a data_inicio");
  }

  // Conceder já ativa: sem endpoint de flip de status, um PENDENTE nunca surtiria
  // efeito (findAcessosAtivosPorUsuario só honra ATIVO).
  const status = String((body && body.status) || "ATIVO")
    .trim()
    .toUpperCase();
  if (!["ATIVO", "SUSPENSO"].includes(status)) {
    throw new BadRequestError("status invalido");
  }

  await autorizarConcessao(perfil, diretoriaId, unidadeId, escopo, acessos);
  const concedidoPorAcessoId = resolverConcedente(acessos, {
    educationDepartmentId: diretoriaId,
    schoolUnitId: unidadeId,
  });

  const nome = body && body.nome !== undefined ? String(body.nome).trim() : null;
  const email =
    body && body.email !== undefined
      ? String(body.email).trim().toLowerCase()
      : null;

  const { acessoId, criouIdentidade } =
    await adminAccessModel.withTransaction(async (tx) => {
      let usuario = await adminUserModel.findByCpf(cpf, tx);
      let criouIdentidadeFlag = false;

      if (!usuario) {
        // find-or-create da identidade admin (keyed por CPF próprio).
        if (!nome) {
          throw new BadRequestError(
            "nome e obrigatorio para novo usuario administrativo"
          );
        }
        await adminUserModel.create(tx, {
          cpf,
          nome,
          email,
          ativo: true,
        });
        usuario = await adminUserModel.findByCpf(cpf, tx);
        if (!usuario) {
          throw new Error("Falha ao obter o usuario administrativo criado");
        }
        criouIdentidadeFlag = true;
      }

      const adminUserId = Number(usuario.id);
      const insert = await adminAccessModel.createAcesso(tx, {
        adminUserId,
        perfil,
        educationDepartmentId: diretoriaId,
        schoolUnitId: unidadeId,
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

  const acesso = await adminAccessModel.findById(acessoId);

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

async function listAcessos(query = {}, { escopo, escopoUnidades } = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;

  const total = await adminAccessModel.countAcessos({
    escopo,
    escopoUnidades,
  });
  const rows = await adminAccessModel.listAcessos({
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

async function getAcesso(acessoId, { escopo } = {}) {
  const acesso = await adminAccessModel.findById(acessoId);
  if (!acesso) {
    throw new NotFoundError("Acesso administrativo nao encontrado");
  }
  const autorizado = recursoNoEscopo(escopo, {
    educationDepartmentId: acesso.diretoria_ensino_id,
    schoolUnitId: acesso.unidade_escolar_id,
  });
  if (!autorizado) {
    throw new ForbiddenError(
      "Acesso administrativo fora do escopo do administrador"
    );
  }
  return { acesso: mapAcesso(acesso) };
}

// Ciclo de vida: cada ação mapeia p/ status-alvo + status de origem válidos.
const ACOES_STATUS = {
  suspender: {
    para: "SUSPENSO",
    de: new Set(["ATIVO"]),
  },
  reativar: {
    para: "ATIVO",
    de: new Set(["SUSPENSO"]),
  },
  revogar: {
    para: "REVOGADO",
    de: new Set(["ATIVO", "SUSPENSO"]),
  },
};

// Reusa a matriz de delegação (podeAlterar) e a checagem de escopo; não duplica
// regras de perfil/escopo. Nunca apaga — só muda status e audita.
async function alterarStatus(acessoId, acao, { adminId, ipOrigem, escopo, acessos } = {}) {
  const acaoNorm = String(acao || "").trim().toLowerCase();
  const regra = ACOES_STATUS[acaoNorm];
  if (!regra) {
    throw new BadRequestError("acao de status invalida");
  }

  const acesso = await adminAccessModel.findById(acessoId);
  if (!acesso) {
    throw new NotFoundError("Acesso administrativo nao encontrado");
  }

  // Nunca altera o próprio acesso (auto-suspensão/revogação).
  if (adminId != null && Number(acesso.usuario_administrativo_id) === Number(adminId)) {
    throw new ForbiddenError("Nao e permitido alterar o proprio acesso");
  }

  // Acesso fora do escopo do administrador (diretoria/unidade).
  if (!recursoNoEscopo(escopo, {
    educationDepartmentId: acesso.diretoria_ensino_id,
    schoolUnitId: acesso.unidade_escolar_id,
  })) {
    throw new ForbiddenError(
      "Acesso administrativo fora do escopo do administrador"
    );
  }

  // Nível: só altera acesso cujo perfil a matriz permite (abaixo do próprio nível).
  const perfilAlvo = String(acesso.perfil || "").trim().toUpperCase();
  const perfis = perfisDoConcedente(acessos);
  const podeAlterarPerfil = Array.from(perfis).some((p) => podeAlterar(p, perfilAlvo));
  if (!podeAlterarPerfil) {
    throw new ForbiddenError(
      "Perfil do administrador nao permite alterar este acesso"
    );
  }

  // REVOGADO é definitivo: reativar é rejeitado (transição inválida → ConflictError).
  const statusAtual = String(acesso.status || "").trim().toUpperCase();
  if (!regra.de.has(statusAtual)) {
    const definitivo = statusAtual === "REVOGADO" && regra.para !== "REVOGADO";
    if (definitivo) {
      throw new ConflictError(
        "Acesso REVOGADO e definitivo: nao pode ser reativado"
      );
    }
    throw new ConflictError(
      `Transicao invalida de ${statusAtual} para ${regra.para}`
    );
  }

  const deStatus = statusAtual;
  const paraStatus = regra.para;

  await adminAccessModel.withTransaction(async (tx) => {
    await adminAccessModel.updateStatus(acessoId, paraStatus, tx);
  });

  // Recarrega pós-update para refletir status/atualizado_em no payload.
  const atualizado = await adminAccessModel.findById(acessoId);

  await registerAuditLog({
    evento: `acesso_administrativo_${acaoNorm}`,
    adminId,
    mensagem: `${acaoNorm} acesso administrativo`,
    ipOrigem,
    metadados: {
      acesso_id: Number(acessoId),
      usuario_administrativo_id: acesso.usuario_administrativo_id,
      perfil: perfilAlvo,
      diretoria_ensino_id:
        acesso.diretoria_ensino_id != null
          ? Number(acesso.diretoria_ensino_id)
          : null,
      unidade_escolar_id:
        acesso.unidade_escolar_id != null
          ? Number(acesso.unidade_escolar_id)
          : null,
      de_status: deStatus,
      para_status: paraStatus,
    },
  });

  return { acesso: mapAcesso(atualizado || acesso) };
}

// /meu: leitura pura, consome só o que o middleware resolveu (req.acessos + req.escopo).
function getMeusAcessos({ escopo, acessos, escopoUnidades } = {}) {
  const lista = Array.isArray(acessos) ? acessos : [];
  return {
    acessos: lista.map(mapMeuAcesso),
    escopo: resumirEscopo(escopo),
    // escopoUnidades é null p/ SEDUC/ausência; preservado para indicar o universo visível.
    unidadesVisiveis: escopoUnidades == null ? null : [...escopoUnidades].map(Number).filter((n) => Number.isInteger(n) && n > 0),
  };
}

module.exports = {
  createAcesso,
  listAcessos,
  getAcesso,
  alterarStatus,
  getMeusAcessos,
};
