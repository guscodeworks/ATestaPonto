"use strict";

const database = require("../config/database");

async function findByEmail(email) {
  return database.executeOne(
    "SELECT id, nome, email, senha_hash, ativo FROM admins WHERE email = ? LIMIT 1",
    [email]
  );
}

async function findActiveCredentialsByEmail(email) {
  return database.executeOne(
    "SELECT id, email, senha_hash FROM admins WHERE email = ? AND ativo = 1 LIMIT 1",
    [email]
  );
}

async function findProfileById(adminId) {
  return database.executeOne(
    "SELECT id, nome, email, ativo, ultimo_login_em, criado_em FROM admins WHERE id = ? LIMIT 1",
    [adminId]
  );
}

async function updateLastLogin(adminId) {
  return database.execute("UPDATE admins SET ultimo_login_em = NOW() WHERE id = ?", [
    adminId,
  ]);
}

module.exports = {
  findByEmail,
  findActiveCredentialsByEmail,
  findProfileById,
  updateLastLogin,
};
