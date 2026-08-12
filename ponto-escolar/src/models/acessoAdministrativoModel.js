"use strict";

const database = require("../config/database");

// getClient: transação explícita ou conexão padrão (padrão dos models).
function getClient(client) {
  return client || database;
}

// Schema real (ponto_backup.sql):
//   acessos_administrativos:
//     id, usuario_administrativo_id (NOT NULL, FK), perfil (ENUM), diretoria_ensino_id
//     (NULL, FK), unidade_escolar_id (NULL, FK), status (ENUM, default 'PENDENTE'),
//     data_inicio (DATE NOT NULL DEFAULT curdate()), data_fim (NULL),
//     concedido_por_acesso_id (NULL, self-FK), criado_em, atualizado_em.
//   CHECK chk_acessos_escopo enforça perfil <-> diretoria/unidade; o Service
//   valida cedo (defense-in-depth), mas o CHECK é a garantia real.

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

// Trecho reutilizável: dados do acesso + nomes resolvidos (para consulta humana).
const ACESSO_DETAIL_SELECT = `
  aa.id, aa.usuario_administrativo_id, aa.perfil, aa.diretoria_ensino_id,
  aa.unidade_escolar_id, aa.status, aa.data_inicio, aa.data_fim,
  aa.concedido_por_acesso_id, aa.criado_em, aa.atualizado_em,
  ua.cpf AS usuario_cpf, ua.nome AS usuario_nome, ua.email AS usuario_email,
  ua.ativo AS usuario_ativo,
  de.nome AS diretoria_ensino_nome,
  ue.nome AS unidade_escolar_nome
`;

const ACESSO_DETAIL_JOINS = `
  FROM acessos_administrativos aa
  INNER JOIN usuarios_administrativos ua ON ua.id = aa.usuario_administrativo_id
  LEFT JOIN diretorias_ensino de ON de.id = aa.diretoria_ensino_id
  LEFT JOIN unidades_escolares ue ON ue.id = aa.unidade_escolar_id
`;

/**
 * Cria um acesso administrativo. Espera ser chamado dentro de uma transação
 * (client primeiro), logo após resolver/criar a identidade do usuário admin.
 * data_inicio é NOT NULL: usa COALESCE(?, CURDATE()) para aplicar a data
 * informada ou o default do banco (mesmo estilo de createVinculo).
 */
async function createAcesso(
  client,
  {
    usuarioAdministrativoId,
    perfil,
    diretoriaEnsinoId = null,
    unidadeEscolarId = null,
    status,
    dataInicio = null,
    dataFim = null,
    concedidoPorAcessoId = null,
  }
) {
  return getClient(client).execute(
    `INSERT INTO acessos_administrativos
      (usuario_administrativo_id, perfil, diretoria_ensino_id, unidade_escolar_id, status, data_inicio, data_fim, concedido_por_acesso_id)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, ?)`,
    [
      usuarioAdministrativoId,
      perfil,
      diretoriaEnsinoId,
      unidadeEscolarId,
      status,
      dataInicio,
      dataFim,
      concedidoPorAcessoId,
    ]
  );
}

/**
 * Acesso por id com nomes de usuário/diretoria/unidade resolvidos.
 */
async function findById(acessoId, client) {
  return getClient(client).executeOne(
    `SELECT ${ACESSO_DETAIL_SELECT} ${ACESSO_DETAIL_JOINS} WHERE aa.id = ? LIMIT 1`,
    [acessoId]
  );
}

// Atualiza apenas o status de um acesso, preservando a linha e todo o
// histórico (perfil, diretoria/unidade, concedido_por, datas). O ciclo de vida
// é transição de status, nunca exclusão — nem do acesso nem do
// usuario_administrativo. Espera ser chamado dentro da transação passada (tx).
async function updateStatus(acessoId, novoStatus, client) {
  return getClient(client).execute(
    "UPDATE acessos_administrativos SET status = ? WHERE id = ?",
    [novoStatus, acessoId]
  );
}

// Monta a cláusula WHERE de escopo para listagens de acessos. SEDUC não filtra;
// demais perfis veem acessos cuja diretoria ou unidade esteja no seu escopo.
// Retorna { clause, params } — clause vazia quando sem filtro.
function buildEscopoFilter(escopo, escopoUnidades) {
  if (!escopo || !escopo.temAcesso || escopo.isSeduc) {
    return { clause: "", params: [] };
  }

  const diretorias = [...(escopo.diretoriasPermitidas || [])];
  const unidades = Array.isArray(escopoUnidades)
    ? escopoUnidades
    : [...(escopo.unidadesPermitidas || [])];

  const unitIds = new Set(unidades.map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const dirIds = new Set(diretorias.map(Number).filter((n) => Number.isInteger(n) && n > 0));

  const conditions = [];
  const params = [];

  if (dirIds.size > 0) {
    const placeholders = [...dirIds].map(() => "?").join(", ");
    conditions.push(`aa.diretoria_ensino_id IN (${placeholders})`);
    params.push(...dirIds);
  }
  if (unitIds.size > 0) {
    const placeholders = [...unitIds].map(() => "?").join(", ");
    conditions.push(`aa.unidade_escolar_id IN (${placeholders})`);
    params.push(...unitIds);
  }

  if (conditions.length === 0) {
    // Acesso restrito a escopo sem diretorias/unidades enumeradas: nada a listar.
    return { clause: " WHERE 1=0", params: [] };
  }

  return { clause: ` WHERE ${conditions.join(" OR ")}`, params };
}

/**
 * Lista acessos no escopo do administrador, paginados.
 */
async function listAcessos({ escopo, escopoUnidades, limit, offset } = {}, client) {
  const { clause, params } = buildEscopoFilter(escopo, escopoUnidades);

  return getClient(client).execute(
    `SELECT ${ACESSO_DETAIL_SELECT} ${ACESSO_DETAIL_JOINS}${clause}
     ORDER BY aa.criado_em DESC, aa.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

/**
 * Conta acessos no escopo (para paginação).
 */
async function countAcessos({ escopo, escopoUnidades } = {}, client) {
  const { clause, params } = buildEscopoFilter(escopo, escopoUnidades);

  const row = await getClient(client).executeOne(
    `SELECT COUNT(*) AS total FROM acessos_administrativos aa${clause}`,
    params
  );
  return Number(row && row.total) || 0;
}

module.exports = {
  withTransaction,
  createAcesso,
  findById,
  updateStatus,
  listAcessos,
  countAcessos,
};
