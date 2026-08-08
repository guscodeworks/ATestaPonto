"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado explicitamente)
// ou usem a conexão padrão do módulo, quando chamadas fora de uma transação.
function getClient(client) {
  return client || database;
}

// No novo schema, `cargos` representa SOMENTE o cargo (sem horários de jornada).
// A jornada (entrada/saída de almoço/retorno/saída) migrou para `vinculos_funcionais`.
// Por isso as queries não selecionam nem filtram por colunas de horário, e o
// antigo GROUP BY por horário (que "deduplicava" cargos por nome) desaparece.

async function listCargos() {
  return database.execute(
    "SELECT id, cargo, ativo FROM cargos ORDER BY cargo ASC",
    []
  );
}

// Aceita o mesmo shape enviado pelo service (com horários) por compatibilidade de
// assinatura, mas ignora os campos de horário — no novo schema eles pertencem ao
// vínculo, não ao cargo. Cadastra apenas o nome do cargo (coluna `cargo` é UNIQUE).
async function createCargo(client, { cargo } = {}) {
  return getClient(client).execute(
    "INSERT INTO cargos (cargo) VALUES (?)",
    [cargo]
  );
}

// Idem: atualiza somente o nome do cargo. Horários recebidos são ignorados.
async function updateCargo(client, cargoId, { cargo } = {}) {
  return getClient(client).execute(
    "UPDATE cargos SET cargo = ? WHERE id = ?",
    [cargo, cargoId]
  );
}

/**
 * Trava o cargo enquanto o funcionário é salvo.
 */
async function findByIdForUpdate(client, cargoId) {
  return getClient(client).executeOne(
    "SELECT id, cargo, ativo FROM cargos WHERE id = ? LIMIT 1 FOR UPDATE",
    [cargoId]
  );
}

module.exports = {
  listCargos,
  createCargo,
  updateCargo,
  findByIdForUpdate,
};
