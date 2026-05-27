'use strict';

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const apiRoutes = require('./routes');
const authRoutes = require('./routes/auth');
const { createPagesRouter } = require('./routes/pages.routes');
const punchRoutes = require('./routes/punchRoutes');
const { validateQrCode } = require('./services/qrCodeService');
const { globalLimiter } = require('./middlewares/rateLimiters');
const { notFoundMiddleware } = require('./middlewares/notFoundMiddleware');
const { errorMiddleware } = require('./middlewares/errorMiddleware');

const app = express();
const viewsRoot = path.resolve(__dirname, '../views');
const publicRoot = path.join(__dirname, '../public');
const assetsRoot = path.join(publicRoot, 'assets');
const assetsCssRoot = path.join(assetsRoot, 'css');
const assetsJsRoot = path.join(assetsRoot, 'js');
const assetsImgRoot = path.join(assetsRoot, 'img');
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

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // ← seguro para LAN/IP
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'upgrade-insecure-requests': null, // ← remove o upgrade forçado de HTTP→HTTPS
    }
  }
})
);

function getRequestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
}

function isSameHostOrigin(req, origin) {
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const requestHost = getRequestHost(req);
    return requestHost.length > 0 && originUrl.host.toLowerCase() === requestHost;
  } catch (_error) {
    return false;
  }
}

function isAllowedRequestOrigin(req, origin) {
  if (!origin) {
    return true;
  }
  if (isSameHostOrigin(req, origin)) {
    return true;
  }
  return isAllowedOrigin(origin);
}

const corsBaseOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;

    if (isAllowedRequestOrigin(req, origin)) {
      return callback(null, {
        ...corsBaseOptions,
        origin: true
      });
    }

    const error = new Error('Origem nao permitida por CORS');
    error.status = 403;
    error.code = 'CORS_ORIGIN_BLOCKED';
    return callback(error);
  })
);

app.use(express.static(publicRoot, staticOptions));
app.use('/assets', express.static(assetsRoot, staticOptions));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(globalLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use(authRoutes);

function sendView(res, relativePath) {
  res.set(noCacheHtmlHeaders);
  res.sendFile(path.join(viewsRoot, relativePath));
}

app.use(
  createPagesRouter({
    sendView,
    validateQrCode,
    schoolUnitCode: env.SCHOOL_UNIT_CODE,
    noCacheHtmlHeaders
  })
);

app.use('/ponto', punchRoutes);
app.use('/api', apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
