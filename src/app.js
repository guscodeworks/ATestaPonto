'use strict';

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const apiRoutes = require('./routes');
const punchRoutes = require('./routes/punchRoutes');
const { globalLimiter } = require('./middlewares/rateLimiters');
const { notFoundMiddleware } = require('./middlewares/notFoundMiddleware');
const { errorMiddleware } = require('./middlewares/errorMiddleware');

const app = express();
const viewsRoot = path.resolve(__dirname, '../views');
const frontendAssets = path.join(viewsRoot, 'assets');
const frontendCss = path.join(frontendAssets, 'css');
const frontendJs = path.join(frontendAssets, 'js');
const frontendImg = path.join(frontendAssets, 'img');
const frontendAdmin = path.join(viewsRoot, 'admin');
const funcionarioRoot = path.join(viewsRoot, 'funcionario');
const staticOptions = {
  maxAge: '1h'
};
const noCacheHtmlHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0'
};

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

app.use('/assets', express.static(frontendAssets));
app.use('/ponto/assets', express.static(frontendAssets, staticOptions));
app.use('/css', express.static(frontendCss, staticOptions));
app.use('/js', express.static(frontendJs, staticOptions));
app.use('/img', express.static(frontendImg, staticOptions));
app.use('/admin', express.static(frontendAdmin));
app.use('/funcionario', express.static(funcionarioRoot));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(globalLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.get('/', (req, res) => {
  res.set(noCacheHtmlHeaders);
  res.sendFile(path.join(viewsRoot, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.set(noCacheHtmlHeaders);
  res.sendFile(path.join(viewsRoot, 'index.html'));
});
app.get('/bater-ponto', (req, res) => {
  res.redirect('/ponto/acessar');
});
app.get('/ponto', (req, res) => {
  res.redirect('/ponto/acessar');
});
app.get('/ponto/acessar', (req, res) => {
  res.set(noCacheHtmlHeaders);
  res.sendFile(path.join(funcionarioRoot, 'login.html'));
});
app.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard.html');
});

app.use('/ponto', punchRoutes);
app.use('/api', apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
