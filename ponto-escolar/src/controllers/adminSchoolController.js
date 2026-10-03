"use strict";

const schoolUnitService = require("../services/schoolUnitService");
const { getClientIp } = require("../utils/request");

// Controller só traduz HTTP <-> service. Escopo e regras ficam no service/middleware.

async function createSchool(req, res, next) {
  try {
    const result = await schoolUnitService.createSchoolUnit(req.body, {
      adminId: req.auth.id,
      ipOrigem: getClientIp(req),
      acessos: req.acessos,
    });

    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

async function listSchools(req, res, next) {
  try {
    const result = await schoolUnitService.listSchoolUnits(
      req.query,
      req.escopoUnidades
    );
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

async function getSchool(req, res, next) {
  try {
    const result = await schoolUnitService.getSchoolUnit(Number(req.params.id));
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

async function listDiretorias(req, res, next) {
  try {
    const items = await schoolUnitService.listDiretoriasParaCadastro(req.acessos);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return next(error);
  }
}

async function lookupCep(req, res, next) {
  try {
    const result = await schoolUnitService.previewCep(req.params.cep);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createSchool,
  listSchools,
  getSchool,
  listDiretorias,
  lookupCep,
};
