'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class NotImplementedError extends AppError {
  constructor(routeName) {
    super(
      `${routeName} sera implementada na proxima etapa tecnica do gov.br-fake.`,
      501,
      'NOT_IMPLEMENTED'
    );
  }
}

module.exports = {
  AppError,
  NotImplementedError
};
