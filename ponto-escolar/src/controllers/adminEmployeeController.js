"use strict";

const employeeService = require("../services/employeeService");
const { getClientIp } = require("../utils/request");

// Quem (admin) + de onde (IP): registrado junto às operações que alteram dados.
function getAuditContext(req) {
  // Centraliza a auditoria p/ manter os handlers focados no HTTP.
  return {
    adminId: req.auth.id,
    ipOrigem: getClientIp(req),
  };
}

async function createEmployee(req, res, next) {
  try {
    const result = await employeeService.createEmployee(
      req.body,
      getAuditContext(req)
    );

    // Cadastro novo não deve ser cacheado por navegador/proxy.
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function listEmployees(req, res, next) {
  try {
    const result = await employeeService.listEmployees(req.query, req.escopoUnidades);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getEmployee(req, res, next) {
  try {
    const result = await employeeService.getEmployee(Number(req.params.id));

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateEmployee(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    const result = await employeeService.updateEmployee(
      employeeId,
      req.body,
      getAuditContext(req)
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function deactivateEmployee(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    const result = await employeeService.deactivateEmployee(
      employeeId,
      req.body.confirmacao,
      getAuditContext(req)
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function reactivateEmployee(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    const result = await employeeService.reactivateEmployee(
      employeeId,
      req.body.confirmacao,
      getAuditContext(req)
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
};
