'use strict';

const crypto = require('crypto');

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateSecureToken(prefix) {
  return `${prefix}_${base64url(crypto.randomBytes(32))}`;
}

function timingSafeStringEquals(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''), 'utf8');
  const right = Buffer.from(String(rightValue || ''), 'utf8');

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sha256Ascii(value) {
  return crypto.createHash('sha256').update(String(value), 'ascii').digest();
}

module.exports = {
  base64url,
  generateSecureToken,
  timingSafeStringEquals,
  sha256Ascii
};
