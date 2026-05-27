class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode || 500;
    this.code = options.code || 'INTERNAL_ERROR';
    this.details = options.details || null;
    this.isOperational = options.isOperational !== false;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = null) {
    super(message, { statusCode: 400, code: 'BAD_REQUEST', details });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED', details });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details = null) {
    super(message, { statusCode: 403, code: 'FORBIDDEN', details });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, { statusCode: 404, code: 'NOT_FOUND', details });
  }
}

class MethodNotAllowedError extends AppError {
  constructor(message = 'Method not allowed', details = null) {
    super(message, { statusCode: 405, code: 'METHOD_NOT_ALLOWED', details });
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', details = null) {
    super(message, { statusCode: 409, code: 'CONFLICT', details });
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation error', details = null) {
    super(message, { statusCode: 422, code: 'VALIDATION_ERROR', details });
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', details = null) {
    super(message, { statusCode: 429, code: 'RATE_LIMITED', details });
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database error', details = null) {
    super(message, { statusCode: 500, code: 'DATABASE_ERROR', details });
  }
}

class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details = null) {
    super(message, { statusCode: 500, code: 'INTERNAL_ERROR', details, isOperational: false });
  }
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error && typeof error === 'object') {
    if (error.name === 'SyntaxError' && error.status === 400 && 'body' in error) {
      return new BadRequestError('Invalid JSON payload');
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return new ConflictError('Duplicate record detected');
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_DEFAULT_FOR_FIELD') {
      return new ValidationError('Invalid reference or missing required field');
    }

    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return new ConflictError('Record is referenced by other resources');
    }

    if (error.code === 'ER_DATA_TOO_LONG' || error.code === 'ER_TRUNCATED_WRONG_VALUE') {
      return new ValidationError('Provided data is invalid or too long');
    }

    const candidateStatus = Number.isInteger(error.statusCode)
      ? error.statusCode
      : (Number.isInteger(error.status) ? error.status : null);
    if (candidateStatus && candidateStatus >= 400 && candidateStatus < 600) {
      return new AppError(error.message || 'Request error', {
        statusCode: candidateStatus,
        code: typeof error.code === 'string' ? error.code : 'REQUEST_ERROR',
        details: error.details || null
      });
    }
  }

  return new InternalServerError();
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  MethodNotAllowedError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  DatabaseError,
  InternalServerError,
  normalizeError
};
