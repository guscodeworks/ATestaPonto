"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado explicitamente)
// ou usem a conexão padrão do módulo, quando chamadas fora de uma transação.
function getClient(client) {
  return client || database;
}

async function listCargos() {
  return database.execute(
    `SELECT id,
            nome,
            TIME_FORMAT(hora_entrada, '%H:%i:%s') AS hora_entrada_padrao,
            TIME_FORMAT(hora_saida, '%H:%i:%s') AS hora_saida_padrao
     FROM cargo
     ORDER BY nome ASC, id ASC`,
    []
  );
}

/**
 * Usa o cliente da transacao para travar o cargo enquanto o funcionario e salvo.
 */
async function findByIdForUpdate(client, cargoId) {
  return getClient(client).executeOne(
    "SELECT id, nome FROM cargo WHERE id = ? LIMIT 1 FOR UPDATE",
    [cargoId]
  );
}

module.exports = {
  listCargos,
  findByIdForUpdate,
};
