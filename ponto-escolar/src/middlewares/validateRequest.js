const { validationResult } = require("express-validator");
const { ValidationError } = require("../utils/errors");

function validateRequest(req, _res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const details = result.array({ onlyFirstError: true }).map((item) => ({
    field: item.path,
    location: item.location,
    message: item.msg,
  }));

  return next(new ValidationError("Dados de requisicao invalidos", details));
}

module.exports = {
  validateRequest,
};
