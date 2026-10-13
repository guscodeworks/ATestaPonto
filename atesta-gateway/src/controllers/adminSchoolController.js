"use strict";

const adminSchoolService = require("../services/adminSchoolService");
const schoolUnitService = require("../services/schoolUnitService");
const { getClientIp } = require("../utils/request");

async function previewSchool(req, res, next) {
  try {
    const result = await adminSchoolService.previewSchool(req.body);
    res.set("Cache-Control", "no-store");
    return res.status(result.status).json(result.body);
  } catch (error) {
    return next(error);
  }
}

async function createSchool(req, res, next) {
  try {
    const result = await adminSchoolService.createSchool(req.body, {
      adminId: req.auth.id,
      ipOrigem: getClientIp(req),
    });
    res.set("Cache-Control", "no-store");
    return res.status(result.status).json(result.body);
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

module.exports = { previewSchool, createSchool, listSchools, getSchool, listDiretorias, lookupCep };
