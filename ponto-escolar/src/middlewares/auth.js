"use strict";

<<<<<<< HEAD
/**
 * MIDDLEWARE auth.js — CORRIGIDO
 *
 * PROBLEMA ENCONTRADO:
 * Este arquivo usava process.env.JWT_SECRET direto,
 * pulando a validação do módulo env.js.
 *
 * CORREÇÃO: Usa env.JWT_SECRET (validado na startup).
 */

const jwt = require('jsonwebtoken');
// ✅ CORREÇÃO: importa env validado em vez de process.env direto
const env = require('../config/env');
const { getAdminAuthCookie } = require('../utils/authCookie');

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') {
    return getAdminAuthCookie(req);
  }
  const [scheme, token] = authHeader.split(' ');
  return /^Bearer$/i.test(scheme) && token ? token.trim() : getAdminAuthCookie(req);
=======
const jwt = require("jsonwebtoken");
const { getAdminAuthCookie } = require("../utils/authCookie");

function getBearerToken(req) {
  const authHeader = req.headers.authorization;

  if (typeof authHeader !== "string") {
    return getAdminAuthCookie(req);
  }

  const [scheme, token] = authHeader.split(" ");
  return /^Bearer$/i.test(scheme) && token
    ? token.trim()
    : getAdminAuthCookie(req);
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
}

function verifyRole(expectedRole) {
  return (req, res, next) => {
    try {
      const token = getBearerToken(req);
      if (!token) {
<<<<<<< HEAD
        return res.status(401).json({ message: 'Acesso não autorizado' });
=======
        return res.status(401).json({ message: "Acesso nao autorizado" });
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
      }

      // ✅ CORREÇÃO: usa env.JWT_SECRET em vez de process.env.JWT_SECRET
      const payload = jwt.verify(token, env.JWT_SECRET);

      if (payload.role !== expectedRole) {
<<<<<<< HEAD
        return res.status(403).json({ message: 'Acesso proibido para este perfil' });
      }

      req.user = {
        id: payload.sub || payload.id,
=======
        return res.status(401).json({ message: "Acesso nao autorizado" });
      }

      req.user = {
        id: payload.id || payload.sub,
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
        role: payload.role,
      };

      return next();
    } catch (_error) {
<<<<<<< HEAD
      return res.status(401).json({ message: 'Token inválido ou expirado' });
=======
      return res.status(401).json({ message: "Acesso nao autorizado" });
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
    }
  };
}

module.exports = {
<<<<<<< HEAD
  verifyAdmin: verifyRole('admin'),
  verifyFuncionario: verifyRole('funcionario'),
=======
  verifyAdmin: verifyRole("admin"),
  verifyFuncionario: verifyRole("funcionario"),
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
};
