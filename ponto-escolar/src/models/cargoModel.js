"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado explicitamente)
// ou usem a conexão padrão do módulo, quando chamadas fora de uma transação.
function getClient(client) {
  return client || database;
}

// FOR UPDATE bloqueia a linha para evitar condição de corrida quando múltiplas
// requisições tentam ler/alterar o mesmo cargo concorrentemente dentro de uma transação.
async function findByIdForUpdate(client, cargoId) {
  return getClient(client).executeOne(
    "SELECT id FROM cargo WHERE id = ? LIMIT 1 FOR UPDATE",
    [cargoId]
  );
}

// Busca o cargo de menor ID como "padrão" quando nenhum cargo específico é informado,
// já bloqueando a linha (FOR UPDATE) para uso dentro de transação.
async function findDefaultForUpdate(client) {
  return getClient(client).executeOne(
    "SELECT id FROM cargo ORDER BY id ASC LIMIT 1 FOR UPDATE"
  );
}

// Cria o cargo padrão usado quando a tabela ainda não possui nenhum registro,
// com horário comercial padrão (08h às 17h) como valor inicial.
async function createDefault(client) {
  return getClient(client).execute(
    `INSERT INTO cargo (nome, hora_entrada, hora_saida)
     VALUES (?, ?, ?)`,
    ["Cargo Padrao", "2000-01-01 08:00:00", "2000-01-01 17:00:00"]
  );
}

module.exports = {
  findByIdForUpdate,
  findDefaultForUpdate,
  createDefault,
};