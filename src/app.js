'use strict';

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const apiRoutes = require('./routes');
const { globalLimiter } = require('./middlewares/rateLimiters');
const { notFoundMiddleware } = require('./middlewares/notFoundMiddleware');
const { errorMiddleware } = require('./middlewares/errorMiddleware');

const app = express();
const frontendRoot = path.resolve(__dirname, '../views/pages/login/css');
const frontendAssets = path.join(frontendRoot, 'assets');
const frontendAdmin = path.join(frontendRoot, 'admin');

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  if (env.CORS_ORIGINS.includes('*')) {
    return !env.IS_PRODUCTION;
  }
  return env.CORS_ORIGINS.includes(origin);
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' }
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      const error = new Error('Origem nao permitida por CORS');
      error.status = 403;
      error.code = 'CORS_ORIGIN_BLOCKED';
      return callback(error);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(globalLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use('/assets', express.static(frontendAssets));
app.use('/admin', express.static(frontendAdmin));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendRoot, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(frontendRoot, 'index.html'));
});
app.get('/bater-ponto', (req, res) => {
  res.redirect('/ponto');
});
app.get('/ponto', (req, res) => {
  res.sendFile(path.join(frontendRoot, 'index.html'));
});
app.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard.html');
});

app.use('/api', apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
