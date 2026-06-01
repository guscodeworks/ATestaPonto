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

function getOptionalValue(name, fallbackValue = '') {
  return String(process.env[name] || fallbackValue || '').trim();
}

function getRequiredFallbackValue(name, fallbackName) {
  const value = getOptionalValue(name, process.env[fallbackName]);

  if (!value) {
    throwConfigError(`"${name}" or "${fallbackName}" is required`);
  }

  return value;
}

function getRequiredUrl(name) {
  const value = getRequiredValue(name);
  return validateUrl(name, value);
}

function validateUrl(name, value) {
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

function getOptionalUrl(name, fallbackValue) {
  const value = getOptionalValue(name, fallbackValue);

  if (!value) {
    throwConfigError(`"${name}" is required`);
  }

  return validateUrl(name, value);
}

function getList(name) {
  return getOptionalValue(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getAdminSubs() {
  return getList('ADMIN_GOVBR_SUBS');
}

function getAdminEmails() {
  return getList('ADMIN_GOVBR_EMAILS').map((email) => email.toLowerCase());
}

function getFakeBaseUrl() {
  return getOptionalValue('GOVBR_FAKE_BASE_URL').replace(/\/+$/, '');
}

function requireAtLeastOneAdminIdentifier(adminSubs, adminEmails) {
  if (adminSubs.length === 0 && adminEmails.length === 0) {
    throwConfigError('"ADMIN_GOVBR_SUBS" or "ADMIN_GOVBR_EMAILS" must include at least one value');
  }
}

function getAuthorizeUrl(fakeBaseUrl) {
  return getOptionalUrl(
    'GOVBR_AUTHORIZE_URL',
    fakeBaseUrl ? `${fakeBaseUrl}/fake-govbr/authorize` : ''
  );
}

function getTokenUrl(fakeBaseUrl) {
  return getOptionalUrl(
    'GOVBR_TOKEN_URL',
    fakeBaseUrl ? `${fakeBaseUrl}/fake-govbr/token` : ''
  );
}

function getUserInfoUrl(fakeBaseUrl) {
  return getOptionalUrl(
    'GOVBR_USERINFO_URL',
    fakeBaseUrl ? `${fakeBaseUrl}/fake-govbr/userinfo` : ''
  );
}

function getGovbrConfig() {
  const fakeBaseUrl = getFakeBaseUrl();
  const adminSubs = getAdminSubs();
  const adminEmails = getAdminEmails();

  requireAtLeastOneAdminIdentifier(adminSubs, adminEmails);

  return Object.freeze({
    authorizeUrl: getAuthorizeUrl(fakeBaseUrl),
    tokenUrl: getTokenUrl(fakeBaseUrl),
    userInfoUrl: getUserInfoUrl(fakeBaseUrl),
    clientId: getRequiredFallbackValue('GOVBR_FAKE_CLIENT_ID', 'GOVBR_CLIENT_ID'),
    clientSecret: getRequiredFallbackValue('GOVBR_FAKE_CLIENT_SECRET', 'GOVBR_CLIENT_SECRET'),
    redirectUri: getOptionalUrl('GOVBR_FAKE_REDIRECT_URI', process.env.GOVBR_REDIRECT_URI),
    adminSubs: Object.freeze(adminSubs),
    adminEmails: Object.freeze(adminEmails)
  });
}

module.exports = {
  getGovbrConfig
};
