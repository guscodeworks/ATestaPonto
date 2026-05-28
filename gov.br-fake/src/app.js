'use strict';

const express = require('express');
const homeRoutes = require('./routes/homeRoutes');
const healthRoutes = require('./routes/healthRoutes');
const govbrRoutes = require('./routes/govbrRoutes');

const app = express();

app.disable('x-powered-by');

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use('/', homeRoutes);
app.use('/health', healthRoutes);
app.use('/fake-govbr', govbrRoutes);

app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Rota nao encontrada no gov.br-fake local.'
    }
  });
});

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
