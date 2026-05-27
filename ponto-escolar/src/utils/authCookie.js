'use strict';

const ADMIN_AUTH_COOKIE = 'admin_token';

function parseMaxAgeSeconds(value) {
  const match = String(value || '8h').trim().match(/^(\d+)([smhd])?$/i);

  if (!match) {
    return 8 * 60 * 60;
  }

  const amount = Number(match[1]);
  const unit = String(match[2] || 's').toLowerCase();
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60
  };

  return amount * multipliers[unit];
}

function buildCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (Number.isInteger(options.maxAge)) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function buildAdminAuthCookie(token) {
  return buildCookie(ADMIN_AUTH_COOKIE, token, {
    maxAge: parseMaxAgeSeconds(process.env.JWT_EXPIRES_IN || '8h')
  });
}

function buildClearAdminAuthCookie() {
  return buildCookie(ADMIN_AUTH_COOKIE, '', { maxAge: 0 });
}

function getCookie(req, name) {
  const rawCookie = String(req.headers.cookie || '');

  return rawCookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((found, part) => {
      if (found) {
        return found;
      }

      const separatorIndex = part.indexOf('=');
      const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
      const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : '';

      return key === name ? decodeURIComponent(value) : null;
    }, null);
}

function getAdminAuthCookie(req) {
  return getCookie(req, ADMIN_AUTH_COOKIE);
}

module.exports = {
  ADMIN_AUTH_COOKIE,
  buildAdminAuthCookie,
  buildClearAdminAuthCookie,
  getAdminAuthCookie,
  getCookie
};
