"use strict";

const app = require("./src/app");
const { env } = require("./src/config/env");
const memoryStore = require("./src/repositories/memoryStore");

const cleanupTimer = memoryStore.startCleanup(env.cleanupIntervalMs);

const server = app.listen(env.port, env.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Servidor gov rodando em http://${env.host}:${env.port}`
  );
});

function shutdown() {
  clearInterval(cleanupTimer);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = server;
