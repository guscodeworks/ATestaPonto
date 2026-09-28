"use strict";

const { Router } = require("express");
const { listCargos } = require("../controllers/adminRoleController");
const { ForbiddenError } = require("../utils/errors");
const {
  filtrarAcessosPorCapacidade,
} = require("../utils/adminCapabilities");

const router = Router();

function exigirCapacidade(capacidade) {
  return function (req, _res, next) {
    const acessosAutorizadores = filtrarAcessosPorCapacidade(
      req.acessos,
      capacidade
    );

    if (acessosAutorizadores.length === 0) {
      return next(new ForbiddenError("Capacidade administrativa insuficiente"));
    }

    return next();
  };
}

router.get("/", exigirCapacidade("cargo.listar"), listCargos);

module.exports = router;
