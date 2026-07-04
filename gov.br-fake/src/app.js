'use strict';

const express = require('express');
const path = require('path');
const homeRoutes = require('./routes/homeRoutes');
const healthRoutes = require('./routes/healthRoutes');
const govbrRoutes = require('./routes/govbrRoutes');

const app = express();
const publicRoot = path.resolve(__dirname, '../public');
const assetsRoot = path.join(publicRoot, 'assets');

// Evita expor a tecnologia do backend (header "X-Powered-By: Express") a clientes,
// reduzindo a superfície de informação disponível para reconhecimento de ataque.
app.disable('x-powered-by');

app.use(express.static(publicRoot, { maxAge: '1h' }));
app.use('/assets', express.static(assetsRoot, { maxAge: '1h' }));
// Limite de 20kb no payload: suficiente para os fluxos OAuth2/PKCE deste serviço fake,
// e ajuda a mitigar requisições anormalmente grandes (proteção básica contra abuso).
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use('/', homeRoutes);
app.use('/health', healthRoutes);
app.use('/fake-govbr', govbrRoutes);

// Handler de 404: precisa vir depois de todas as rotas registradas acima, já que o
// Express avalia os middlewares na ordem declarada.
app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Rota nao encontrada no gov.br-fake local.'
    }
  });
});

// Error handler central (assinatura de 4 argumentos identifica isso para o Express).
// Restringe o status code a um intervalo válido (400-599) para evitar responder com
// um código inesperado caso `error.statusCode`/`error.status` venha malformado.
// Para erros 500, a mensagem original é ocultada do cliente (mensagem genérica),
// evitando vazar detalhes internos de implementação; para os demais, a mensagem
// específica do erro é repassada (útil para depuração do fluxo OAuth2 pelo cliente).
app.use((error, _req, res, _next) => {
  const statusCode = Number(error.statusCode || error.status || 500);
  const safeStatusCode = statusCode >= 400 && statusCode <= 599 ? statusCode : 500;

  return res.status(safeStatusCode).json({
    success: false,
    error: {
      code: error.code || (safeStatusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message: safeStatusCode === 500
        ? 'Erro interno no gov.br-fake local.'
        : String(error.message || 'Requisicao invalida.')
    }
  });
});

module.exports = app;