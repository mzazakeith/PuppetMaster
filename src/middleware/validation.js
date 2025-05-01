const { ApiError } = require('./errorHandler');

/**
 * Middleware to validate request data using Joi schemas
 * @param {Object} schemas - Object containing Joi schemas for body, query, params
 * @returns {Function} Express middleware
 */
const validateRequest = (schemas) => {
  return (req, res, next) => {
    const validationErrors = {};
    
    // Validate request body
    if (schemas.body && req.body) {
      const { error } = schemas.body.validate(req.body, { abortEarly: false });
      if (error) {
        validationErrors.body = error.details.map(err => ({
          message: err.message,
          path: err.path
        }));
      }
    }
    
    // Validate query parameters
    if (schemas.query && req.query) {
      const { error } = schemas.query.validate(req.query, { abortEarly: false });
      if (error) {
        validationErrors.query = error.details.map(err => ({
          message: err.message,
          path: err.path
        }));
      }
    }
    
    // Validate route parameters
    if (schemas.params && req.params) {
      const { error } = schemas.params.validate(req.params, { abortEarly: false });
      if (error) {
        validationErrors.params = error.details.map(err => ({
          message: err.message,
          path: err.path
        }));
      }
    }
    
    // If validation errors exist, return error response
    if (Object.keys(validationErrors).length > 0) {
      return next(ApiError.badRequest('Validation error', validationErrors));
    }
    
    next();
  };
};

module.exports = {
  validateRequest
}; 