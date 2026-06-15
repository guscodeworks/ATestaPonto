const { NotFoundError } = require("../utils/errors");

function notFoundMiddleware(req, _res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = {
  notFoundMiddleware,
};
