const pointReportService = require("../services/pointReportService");
const { getClientIp } = require("../utils/request");

async function getTodayPoints(req, res, next) {
  try {
    const result = await pointReportService.getTodayPoints({
      data: req.query.data,
    });

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
    const result = await pointReportService.getDailyReport({
      data: req.query.data,
      adminId: req.auth.id,
      ipOrigem: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getDashboardSummary(req, res, next) {
  try {
    const result = await pointReportService.getDashboardSummary();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getTodayPoints,
  getDailyReport,
  getDashboardSummary,
};
