const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');

/**
 * Error response interface for consistent API error responses
 */
const errorResponse = (statusCode, message, errors = []) => {
  return {
    status: 'error',
    statusCode,
    message,
    errors,
    timestamp: new Date().toISOString()
  };
};

/**
 * Central error handling middleware for Express
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Something went wrong';
  const errors = err.errors || [];

  // Don't leak stack traces in production
  const stack = process.env.NODE_ENV === 'production' ? undefined : err.stack;

  // Log the error
  logger.error(`[${req.method}] ${req.path} - ${statusCode}: ${message}`, {
    error: err.name,
    stack,
    requestId: req.id,
    userId: req.user?.id
  });

  res.status(statusCode).json(errorResponse(statusCode, message, errors));
};

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors) {
    return new ApiError(StatusCodes.BAD_REQUEST, message || 'Bad Request', errors);
  }

  static unauthorized(message, errors) {
    return new ApiError(StatusCodes.UNAUTHORIZED, message || 'Unauthorized', errors);
  }

  static forbidden(message, errors) {
    return new ApiError(StatusCodes.FORBIDDEN, message || 'Forbidden', errors);
  }

  static notFound(message, errors) {
    return new ApiError(StatusCodes.NOT_FOUND, message || 'Resource not found', errors);
  }

  static tooManyRequests(message, errors) {
    return new ApiError(StatusCodes.TOO_MANY_REQUESTS, message || 'Too many requests', errors);
  }

  static internal(message, errors) {
    return new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR, 
      message || 'Internal server error', 
      errors
    );
  }
}

module.exports = {
  errorHandler,
  ApiError
}; 