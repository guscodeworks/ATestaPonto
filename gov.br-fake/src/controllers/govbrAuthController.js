'use strict';

const { NotImplementedError } = require('../utils/errors');

function respondNotImplemented(routeName) {
  return (_req, _res, next) => {
    return next(new NotImplementedError(routeName));
  };
}

const showAuthorize = respondNotImplemented('GET /fake-govbr/authorize');
const login = respondNotImplemented('POST /fake-govbr/login');
const exchangeToken = respondNotImplemented('POST /fake-govbr/token');
const showUserInfo = respondNotImplemented('GET /fake-govbr/userinfo');

module.exports = {
  showAuthorize,
  login,
  exchangeToken,
  showUserInfo
};
