"use strict";

const app = require("./src/app");
const { env } = require("./src/config/env");
const memoryStore = require("./src/repositories/memoryStore");

// Inicia a limpeza periódica de registros expirados (codes, tokens, sessões) em
// background, para que o encerramento gracioso abaixo possa cancelá-la explicitamente.
const cleanupTimer = memoryStore.startCleanup(env.cleanupIntervalMs);

const server = app.listen(env.port, env.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Servidor gov rodando em http://${env.host}:${env.port}`
  );
});

// Encerramento gracioso: para o timer de limpeza e fecha o servidor (aguardando
// conexões em andamento) antes de finalizar o processo, evitando que requisições
// sejam interrompidas abruptamente ao receber um sinal de término.
function shutdown() {
  clearInterval(cleanupTimer);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = server;