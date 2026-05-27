'use strict';

const jwt = require('jsonwebtoken');
const { getAdminAuthCookie } = require('../utils/authCookie');

function getBearerToken(req) {
  const authHeader = req.headers.authorization;

  if (typeof authHeader !== 'string') {
    return getAdminAuthCookie(req);
  }

  const [scheme, token] = authHeader.split(' ');
  return /^Bearer$/i.test(scheme) && token ? token.trim() : getAdminAuthCookie(req);
}

function verifyRole(expectedRole) {
  return (req, res, next) => {
    try {
      const token = getBearerToken(req);

      if (!token) {
        return res.status(401).json({ message: 'Acesso nao autorizado' });
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);

      if (payload.role !== expectedRole) {
        return res.status(401).json({ message: 'Acesso nao autorizado' });
      }

      req.user = {
        id: payload.id || payload.sub,
        role: payload.role
      };

      return next();
    } catch (_error) {
      return res.status(401).json({ message: 'Acesso nao autorizado' });
    }
  };
}

module.exports = {
  verifyAdmin: verifyRole('admin'),
  verifyFuncionario: verifyRole('funcionario')
};
