"use strict";

// Entrypoint exclusivo da Vercel Function. O servidor HTTP local continua em
// server.js; importar o app aqui nao executa listen() nem health check inicial.
module.exports = require("../src/app.js");
