"use strict";

const schoolUnitService = require("../services/schoolUnitService");

async function listSchools(req, res, next) {
  try {
    const data = await schoolUnitService.getSchoolManagement({
      escopo: req.escopo,
      escopoUnidades: req.escopoUnidades,
      acessos: req.acessos,
    });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function createSchool(req, res, next) {
  try {
    const data = await schoolUnitService.createSchool(req.body, {
      escopo: req.escopo,
      acessos: req.acessos,
    });
    res.set("Cache-Control", "no-store");
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function lookupPostalCode(req, res, next) {
  try {
    const data = await schoolUnitService.lookupPostalCode(req.params.cep);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listSchools, createSchool, lookupPostalCode };