'use strict';

require('dotenv').config({ quiet: true });

function throwConfigError(message) {
  throw new Error(`Invalid Gov.br configuration: ${message}`);
}

function getRequiredValue(name) {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throwConfigError(`"${name}" is required`);
  }

  return value;
}

function getRequiredUrl(name) {
  const value = getRequiredValue(name);
  let url;

  try {
    url = new URL(value);
  } catch (_error) {
    throwConfigError(`"${name}" must be a valid URL`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throwConfigError(`"${name}" must use HTTP or HTTPS`);
  }

  return url.toString();
}

function getAdminSubs() {
  const subs = getRequiredValue('ADMIN_GOVBR_SUBS')
    .split(',')
    .map((sub) => sub.trim())
    .filter(Boolean);

  if (subs.length === 0) {
    throwConfigError('"ADMIN_GOVBR_SUBS" must include at least one subject');
  }

  return subs;
}

function getGovbrConfig() {
  return Object.freeze({
    authorizeUrl: getRequiredUrl('GOVBR_AUTHORIZE_URL'),
    tokenUrl: getRequiredUrl('GOVBR_TOKEN_URL'),
    userInfoUrl: getRequiredUrl('GOVBR_USERINFO_URL'),
    clientId: getRequiredValue('GOVBR_CLIENT_ID'),
    clientSecret: String(process.env.GOVBR_CLIENT_SECRET || '').trim(),
    redirectUri: getRequiredUrl('GOVBR_REDIRECT_URI'),
    adminSubs: Object.freeze(getAdminSubs())
  });
}

module.exports = {
  getGovbrConfig
};
