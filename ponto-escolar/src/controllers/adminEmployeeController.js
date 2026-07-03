"use strict";

const employeeService = require("../services/employeeService");
const { getClientIp } = require("../utils/request");

// Contexto de auditoria: identifica quem fez a ação (admin autenticado)
// e de onde (IP), para ser registrado junto às operações que alteram
// dados de funcionários (criação, edição, mudança de status).
function getAuditContext(req) {
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
    const result = await employeeService.listEmployees(req.query);

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

async function setEmployeeStatus(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    const ativo = Boolean(req.body.ativo);
    const result = await employeeService.setEmployeeStatus(
      employeeId,
      ativo,
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
  updateEmployee,
  setEmployeeStatus,
};