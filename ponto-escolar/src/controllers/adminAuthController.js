const adminAuthService = require("../services/adminAuthService");

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")?.[0]?.trim() || req.ip || {}
  );
}

async function loginAdmin(req, res, next) {
  try {
    const result = await adminAuthService.loginAdmin(req.body, {
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

async function getAdminProfile(req, res, next) {
  try {
    const result = await adminAuthService.getAdminProfile(req.auth.id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  loginAdmin,
  getAdminProfile,
};
