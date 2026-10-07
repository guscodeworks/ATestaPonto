const pointReportService = require("../services/pointReportService");
const { getClientIp } = require("../utils/request");

async function getTodayPoints(req, res, next) {
  try {
    const result = await pointReportService.getTodayPoints({
      data: req.query.data,
    }, req.escopoUnidades);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getDailyReport(req, res, next) {
  try {
    // Audita a geração: registra adminId/ipOrigem (diferente de getTodayPoints).
    const result = await pointReportService.getDailyReport({
      data: req.query.data,
      adminId: req.auth.id,
      ipOrigem: getClientIp(req),
    }, req.escopoUnidades);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getWeeklyReport(req, res, next) {
  try {
    const result = await pointReportService.getWeeklyReport({
      data: req.query.data,
    }, req.escopoUnidades);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

async function getDashboardSummary(req, res, next) {
  try {
    const result = await pointReportService.getDashboardSummary(req.escopoUnidades);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getHierarchicalReport(req, res, next) {
  try {
    const result = await pointReportService.getHierarchicalReport({
      data: req.query.data,
      diretoria_ensino_id: req.query.diretoria_ensino_id,
      unidade_escolar_id: req.query.unidade_escolar_id,
      adminId: req.auth.id,
      ipOrigem: getClientIp(req),
    }, req.escopoUnidades, req.escopo);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getTodayPoints,
  getDailyReport,
  getWeeklyReport,
  getDashboardSummary,
  getHierarchicalReport,
};
