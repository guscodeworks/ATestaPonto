"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado explicitamente)
// ou usem a conexão padrão do módulo, quando chamadas fora de uma transação.
function getClient(client) {
  return client || database;
}

async function listCargos() {
  return database.execute(
    "SELECT MIN(id) AS id, cargo, cargo AS nome, TIME_FORMAT(entrada, '%H:%i:%s') AS entrada, TIME_FORMAT(entrada, '%H:%i:%s') AS hora_entrada_padrao, TIME_FORMAT(saida_almoco, '%H:%i:%s') AS saida_almoco, TIME_FORMAT(retorno_almoco, '%H:%i:%s') AS retorno_almoco, TIME_FORMAT(saida, '%H:%i:%s') AS saida, TIME_FORMAT(saida, '%H:%i:%s') AS hora_saida_padrao FROM cargos GROUP BY cargo, entrada, saida_almoco, retorno_almoco, saida ORDER BY cargo ASC, MIN(id) ASC",
    []
  );
}

async function updateCargo(
  client,
  cargoId,
  { cargo, entrada, saidaAlmoco, retornoAlmoco, saida }
) {
  return getClient(client).execute(
    "UPDATE cargos SET cargo = ?, entrada = ?, saida_almoco = ?, retorno_almoco = ?, saida = ? WHERE id = ?",
    [cargo, entrada, saidaAlmoco, retornoAlmoco, saida, cargoId]
  );
}

async function createCargo(
  client,
  { cargo, entrada, saidaAlmoco, retornoAlmoco, saida }
) {
  return getClient(client).execute(
    "INSERT INTO cargos (cargo, entrada, saida_almoco, retorno_almoco, saida) VALUES (?, ?, ?, ?, ?)",
    [cargo, entrada, saidaAlmoco, retornoAlmoco, saida]
  );
}

/**
 * Usa o cliente da transacao para travar o cargo enquanto o funcionario e salvo.
 */
async function findByIdForUpdate(client, cargoId) {
  return getClient(client).executeOne(
    "SELECT id, cargo, cargo AS nome, entrada, saida_almoco, retorno_almoco, saida FROM cargos WHERE id = ? LIMIT 1 FOR UPDATE",
    [cargoId]
  );
}

module.exports = {
  listCargos,
  createCargo,
  updateCargo,
  findByIdForUpdate,
};
