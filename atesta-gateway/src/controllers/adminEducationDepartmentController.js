"use strict";

const service = require("../services/educationDepartmentService");
const { getClientIp } = require("../utils/request");

function context(req) {
  return { adminId: req.auth.id, ipOrigem: getClientIp(req) };
}

async function list(req, res, next) {
  try {
    const items = await service.listAdministrative(req.query.ativo);
    return res.json({ success: true, data: { items } });
  } catch (error) { return next(error); }
}

async function create(req, res, next) {
  try {
    const data = await service.create(req.body, context(req));
    return res.status(201).json({ success: true, data });
  } catch (error) { return next(error); }
}

async function update(req, res, next) {
  try {
    const data = await service.update(req.params.id, req.body, context(req));
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
}

async function changeStatus(req, res, next) {
  try {
    const data = await service.changeStatus(req.params.id, req.body, context(req));
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
}

module.exports = { list, create, update, changeStatus };
