"use strict";

const schoolUnitService = require("../services/schoolUnitService");

async function listSchools(req, res, next) {
  try {
    const items = await schoolUnitService.listSchools(req.query, req.acessosAutorizadores || req.acessos);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return next(error);
  }
}

async function lookupSchoolAddress(req, res, next) {
  try {
    const suggestion = await schoolUnitService.lookupSchoolAddress(req.params.cep);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: suggestion });
  } catch (error) {
    return next(error);
  }
}

async function createSchool(req, res, next) {
  try {
    const school = await schoolUnitService.createSchool(req.body, req.acessosAutorizadores || req.acessos);
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    return res.status(201).json({ success: true, data: school });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listSchools, lookupSchoolAddress, createSchool };
