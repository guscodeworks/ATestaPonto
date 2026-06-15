"use strict";

<<<<<<< HEAD
require("dotenv").config({ quiet: true });

function throwConfigError(message) {
  throw new Error(`Invalid Gov.br configuration: ${message}`);
}

function getRequiredValue(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    throwConfigError(`"${name}" is required`);
  }

  return value;
}

function getOptionalValue(name, fallbackValue = "") {
  return String(process.env[name] || fallbackValue || "").trim();
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

  if (!["http:", "https:"].includes(url.protocol)) {
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
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getAdminSubs() {
  return getList("ADMIN_GOVBR_SUBS");
}

function getAdminEmails() {
  return getList("ADMIN_GOVBR_EMAILS").map((email) => email.toLowerCase());
}

function getFakeBaseUrl() {
  return getOptionalValue("GOVBR_FAKE_BASE_URL").replace(/\/+$/, "");
}

function isProduction() {
  return String(process.env.NODE_ENV || 'development').trim().toLowerCase() === 'production';
}

function requireAtLeastOneAdminIdentifier(adminSubs, adminEmails) {
  if (adminSubs.length === 0 && adminEmails.length === 0) {
    throwConfigError(
      '"ADMIN_GOVBR_SUBS" or "ADMIN_GOVBR_EMAILS" must include at least one value'
    );
  }
}

function requireProductionAdminSub(adminSubs) {
  if (isProduction() && adminSubs.length === 0) {
    throwConfigError('"ADMIN_GOVBR_SUBS" must include at least one sub in production');
  }
}

function getAuthorizeUrl(fakeBaseUrl) {
  return getOptionalUrl(
    "GOVBR_AUTHORIZE_URL",
    fakeBaseUrl ? `${fakeBaseUrl}/fake-govbr/authorize` : ""
  );
}

function getTokenUrl(fakeBaseUrl) {
  return getOptionalUrl(
    "GOVBR_TOKEN_URL",
    fakeBaseUrl ? `${fakeBaseUrl}/fake-govbr/token` : ""
  );
}

function getUserInfoUrl(fakeBaseUrl) {
  return getOptionalUrl(
    "GOVBR_USERINFO_URL",
    fakeBaseUrl ? `${fakeBaseUrl}/fake-govbr/userinfo` : ""
  );
}
=======
const env = require("./env");
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a

function getClientId() {
  return isProduction()
    ? getRequiredValue('GOVBR_CLIENT_ID')
    : getRequiredFallbackValue('GOVBR_FAKE_CLIENT_ID', 'GOVBR_CLIENT_ID');
}

function getClientSecret() {
  return isProduction()
    ? getRequiredValue('GOVBR_CLIENT_SECRET')
    : getRequiredFallbackValue('GOVBR_FAKE_CLIENT_SECRET', 'GOVBR_CLIENT_SECRET');
}

function getRedirectUri() {
  return isProduction()
    ? getRequiredUrl('GOVBR_REDIRECT_URI')
    : getOptionalUrl('GOVBR_FAKE_REDIRECT_URI', process.env.GOVBR_REDIRECT_URI);
}

function assertProductionProvider(config) {
  if (!isProduction()) {
    return;
  }

  const providerUrls = [config.authorizeUrl, config.tokenUrl, config.userInfoUrl];
  providerUrls.forEach((value) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (url.protocol !== 'https:') {
      throwConfigError('Gov.br URLs must use HTTPS in production');
    }
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      throwConfigError('Local Gov.br provider URLs are not allowed in production');
    }
    if (path.includes('/fake-govbr')) {
      throwConfigError('The fake Gov.br provider is not allowed in production');
    }
  });

  if (config.clientSecret === 'dev-secret') {
    throwConfigError('Development Gov.br client secret is not allowed in production');
  }
}

function getGovbrConfig() {
<<<<<<< HEAD
  const fakeBaseUrl = getFakeBaseUrl();
  const adminSubs = getAdminSubs();
  const adminEmails = getAdminEmails();

  requireAtLeastOneAdminIdentifier(adminSubs, adminEmails);
  requireProductionAdminSub(adminSubs);

  const config = {
    authorizeUrl: getAuthorizeUrl(fakeBaseUrl),
    tokenUrl: getTokenUrl(fakeBaseUrl),
    userInfoUrl: getUserInfoUrl(fakeBaseUrl),
    clientId: getClientId(),
    clientSecret: getClientSecret(),
    redirectUri: getRedirectUri(),
    adminSubs: Object.freeze(adminSubs),
    adminEmails: Object.freeze(adminEmails),
  };

  assertProductionProvider(config);
  return Object.freeze(config);
=======
  // Gov.br autentica a identidade; Ponto Escolar autoriza o admin.
  return Object.freeze({
    authorizeUrl: env.GOVBR_AUTHORIZE_URL,
    tokenUrl: env.GOVBR_TOKEN_URL,
    userInfoUrl: env.GOVBR_USERINFO_URL,
    clientId: env.GOVBR_CLIENT_ID,
    clientSecret: env.GOVBR_CLIENT_SECRET,
    redirectUri: env.GOVBR_REDIRECT_URI,
    adminSubs: env.ADMIN_GOVBR_SUBS,
    adminEmails: env.ADMIN_GOVBR_EMAILS,
  });
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
}

module.exports = {
  getGovbrConfig,
};
