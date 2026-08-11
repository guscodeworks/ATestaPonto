"use strict";

const database = require("../config/database");

// Permite que a query participe de uma transação (client passado
// explicitamente) ou use a conexão padrão do módulo, alinhado aos demais
// models. O cadastro de funcionário sempre executa dentro de transação,
// mas mantemos o padrão getClient para consistência com o restante da camada.
function getClient(client) {
  return client || database;
}

// NOVO SCHEMA: os horários da jornada vivem em `vinculos_funcionais` (não mais
// em `cargos`), com nomes horario_entrada/horario_saida_almoco/horario_volta_almoco/
// horario_saida. `status` é enum('ATIVO','AFASTADO','ENCERRADO'). A jornada do
// funcionário para bater ponto / dashboard agora se resolve a partir do seu
// vínculo ativo, que também liga a cargo, unidade escolar e (via unidade) a
// diretoria de ensino.

/**
 * Cria o vínculo funcional do funcionário, vinculando-o à unidade escolar e
 * ao cargo com os horários definidos no cadastro.
 *
 * Deve ser chamado dentro da transação de cadastro (mesmo `client`) para que o
 * rollback de funcionário/cargo/login também desfaça o vínculo em caso de
 * falha. Os horários são reutilizados do cargo já criado para evitar consultas
 * duplicadas.
 *
 * A assinatura preserva os nomes lógicos (entrada/saidaAlmoco/retornoAlmoco/
 * saida) que o Service já envia; o mapeamento para as colunas reais do novo
 * schema (horario_*) é feito aqui dentro. `status` é fixo ("ATIVO") no
 * cadastro e `data_inicio` usa CURDATE() no banco, conforme regra de negócio
 * do vínculo inicial.
 *
 * OBS.: no novo schema `unidade_escolar_id` é NOT NULL — se o caller enviar
 * null (compatibilidade com o front atual), o INSERT será rejeitado pelo banco.
 * Esse ajuste de caller cabe ao Service, não ao Model.
 */
async function createVinculo(
  client,
  {
    funcionarioId,
    unidadeEscolarId = null,
    cargoId,
    entrada,
    saidaAlmoco,
    retornoAlmoco,
    saida,
  }
) {
  return getClient(client).execute(
    "INSERT INTO vinculos_funcionais (funcionario_id, unidade_escolar_id, cargo_id, horario_entrada, horario_saida_almoco, horario_volta_almoco, horario_saida, data_inicio, status) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)",
    [
      funcionarioId,
      unidadeEscolarId,
      cargoId,
      entrada,
      saidaAlmoco,
      retornoAlmoco,
      saida,
      "ATIVO",
    ]
  );
}

// Colunas de horário formatadas e campos básicos, reutilizados por leituras.
const VINCULO_SELECT = `
  v.id, v.funcionario_id, v.unidade_escolar_id, v.cargo_id, v.matricula,
  TIME_FORMAT(v.horario_entrada, '%H:%i:%s') AS entrada,
  TIME_FORMAT(v.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
  TIME_FORMAT(v.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
  TIME_FORMAT(v.horario_saida, '%H:%i:%s') AS saida,
  v.data_inicio, v.data_fim, v.status, v.criado_em, v.atualizado_em
`;

// Dados de cargo + unidade escolar + diretoria de ensino resolvidos via vínculo.
// cargo e unidade são INNER (NOT NULL no vínculo); diretoria via LEFT por
// robustez (embora unidade.diretoria_ensino_id também seja NOT NULL).
const VINCULO_WITH_DETAILS_SELECT = `
  ${VINCULO_SELECT},
  c.cargo,
  ue.nome AS unidade_escolar_nome, ue.codigo_inep AS unidade_codigo_inep,
  ue.ativa AS unidade_ativa,
  de.id AS diretoria_ensino_id, de.nome AS diretoria_nome, de.codigo AS diretoria_codigo
`;

const VINCULO_WITH_DETAILS_JOINS = `
  FROM vinculos_funcionais v
  INNER JOIN cargos c ON c.id = v.cargo_id
  INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
  LEFT JOIN diretorias_ensino de ON de.id = ue.diretoria_ensino_id
`;

/**
 * Retorna o vínculo pelo id (sem travar).
 */
async function getById(vinculoId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.id = ? LIMIT 1`,
    [vinculoId]
  );
}

/**
 * Trava o vínculo para alteração dentro de uma transação.
 */
async function getByIdForUpdate(client, vinculoId) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.id = ? LIMIT 1 FOR UPDATE`,
    [vinculoId]
  );
}

// Mapeia campos lógicos (recebidos do service) -> SQL de atualização de uma
// coluna só, no mesmo estilo da allowlist de employeeModel. Os nomes de coluna
// nunca são interpolados a partir da requisição (seguro contra SQL injection).
const VINCULO_UPDATE_ALLOWLIST = Object.freeze({
  matricula: "UPDATE vinculos_funcionais SET matricula = ? WHERE id = ?",
  entrada: "UPDATE vinculos_funcionais SET horario_entrada = ? WHERE id = ?",
  saidaAlmoco: "UPDATE vinculos_funcionais SET horario_saida_almoco = ? WHERE id = ?",
  retornoAlmoco: "UPDATE vinculos_funcionais SET horario_volta_almoco = ? WHERE id = ?",
  saida: "UPDATE vinculos_funcionais SET horario_saida = ? WHERE id = ?",
  dataInicio: "UPDATE vinculos_funcionais SET data_inicio = ? WHERE id = ?",
  dataFim: "UPDATE vinculos_funcionais SET data_fim = ? WHERE id = ?",
  status: "UPDATE vinculos_funcionais SET status = ? WHERE id = ?",
  unidadeEscolarId: "UPDATE vinculos_funcionais SET unidade_escolar_id = ? WHERE id = ?",
  cargoId: "UPDATE vinculos_funcionais SET cargo_id = ? WHERE id = ?",
});

/**
 * Atualiza somente os campos fornecidos, preservando os demais. Espera ser
 * chamado dentro de uma transação, preferencialmente após getByIdForUpdate.
 */
async function update(client, vinculoId, fields = {}) {
  let lastResult = { affectedRows: 0 };
  let totalAffectedRows = 0;

  for (const field of Object.keys(VINCULO_UPDATE_ALLOWLIST)) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) {
      continue;
    }

    lastResult = await getClient(client).execute(
      VINCULO_UPDATE_ALLOWLIST[field],
      [fields[field], vinculoId]
    );
    totalAffectedRows += Number(lastResult.affectedRows || 0);
  }

  return {
    ...lastResult,
    affectedRows: totalAffectedRows,
  };
}

/**
 * Encerra o vínculo no desligamento do funcionário usando data_fim calculada
 * no servidor (CURRENT_DATE, consistente com CURDATE() usado no cadastro) —
 * evita divergência de fuso do processo Node e mantém o histórico de pontos
 * intacto (não há DELETE em registro_de_pontos). status passa a ENCERRADO.
 * Espera ser chamado dentro da transação de desativação após travar o vínculo
 * ativo via findActiveByFuncionarioIdForUpdate.
 */
async function encerrarVinculo(client, vinculoId) {
  return getClient(client).execute(
    "UPDATE vinculos_funcionais SET status = 'ENCERRADO', data_fim = CURRENT_DATE WHERE id = ?",
    [vinculoId]
  );
}

/**
 * Todos os vínculos do funcionário (ordenados do mais recente ao mais antigo).
 */
async function findByFuncionarioId(funcionarioId, client) {
  return getClient(client).execute(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.funcionario_id = ? ORDER BY v.id DESC`,
    [funcionarioId]
  );
}

/**
 * Vínculo ATIVO do funcionário (um único, o mais recente). É a fonte da
 * jornada/cargo/escola atuais para bater ponto e dashboard.
 */
async function findActiveByFuncionarioId(funcionarioId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1`,
    [funcionarioId]
  );
}

/**
 * Trava o vínculo ativo do funcionário durante o registro de ponto, evitando
 * batidas concorrentes.
 */
async function findActiveByFuncionarioIdForUpdate(client, funcionarioId) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1 FOR UPDATE`,
    [funcionarioId]
  );
}

/**
 * Vínculo ativo com cargo + unidade escolar + diretoria de ensino resolvidos,
 * a partir do id do funcionário. Usado para obter, de uma só vez, jornada,
 * cargo, escola (nome/inep/ativa) e diretoria no fluxo de ponto/dashboard.
 */
async function findActiveByFuncionarioIdWithDetails(funcionarioId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_WITH_DETAILS_SELECT} ${VINCULO_WITH_DETAILS_JOINS} WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1`,
    [funcionarioId]
  );
}

/**
 * Dado o id de um vínculo, resolve o próprio vínculo + cargo + escola +
 * diretoria (e o funcionario_id). Útil a partir de chave estrangeira
 * `vinculo_funcional_id` (ex.: registro_de_pontos) para localizar o
 * funcionário e a unidade de geolocalização.
 */
async function findByIdWithDetails(vinculoId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_WITH_DETAILS_SELECT} ${VINCULO_WITH_DETAILS_JOINS} WHERE v.id = ? LIMIT 1`,
    [vinculoId]
  );
}

module.exports = {
  createVinculo,
  getById,
  getByIdForUpdate,
  update,
  encerrarVinculo,
  findByFuncionarioId,
  findActiveByFuncionarioId,
  findActiveByFuncionarioIdForUpdate,
  findActiveByFuncionarioIdWithDetails,
  findByIdWithDetails,
};
