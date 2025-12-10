/**
 * Comprehensive Error Handling System for MCP Server
 * Following best practices for error handling in Node.js applications
 */

/**
 * Base error class with structured error information
 */
export class BaseError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
    };
  }
}

/**
 * Validation Error - 400
 */
export class ValidationError extends BaseError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }

  static fromJoi(joiError) {
    const errors = joiError.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type,
    }));
    return new ValidationError('Validation failed', errors);
  }
}

/**
 * Authentication Error - 401
 */
export class AuthenticationError extends BaseError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization Error - 403
 */
export class AuthorizationError extends BaseError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not Found Error - 404
 */
export class NotFoundError extends BaseError {
  constructor(resource, identifier) {
    super(`${resource} not found: ${identifier}`, 404, 'NOT_FOUND');
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Conflict Error - 409
 */
export class ConflictError extends BaseError {
  constructor(message, resource) {
    super(message, 409, 'CONFLICT');
    this.resource = resource;
  }
}

/**
 * Rate Limit Error - 429
 */
export class RateLimitError extends BaseError {
  constructor(retryAfter = 60) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * External Service Error - 502
 */
export class ExternalServiceError extends BaseError {
  constructor(service, originalError) {
    super(`External service error: ${service}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError?.message || originalError;
  }
}

/**
 * Ghost API specific errors
 */
export class GhostAPIError extends ExternalServiceError {
  constructor(operation, originalError, statusCode) {
    super('Ghost API', originalError);
    this.operation = operation;
    this.ghostStatusCode = statusCode;

    // Map Ghost API status codes to our error types
    if (statusCode === 401) {
      this.statusCode = 401;
      this.code = 'GHOST_AUTH_ERROR';
    } else if (statusCode === 404) {
      this.statusCode = 404;
      this.code = 'GHOST_NOT_FOUND';
    } else if (statusCode === 422) {
      this.statusCode = 400;
      this.code = 'GHOST_VALIDATION_ERROR';
    } else if (statusCode === 429) {
      this.statusCode = 429;
      this.code = 'GHOST_RATE_LIMIT';
    }
  }
}

/**
 * MCP Protocol Error
 */
export class MCPProtocolError extends BaseError {
  constructor(message, details = {}) {
    super(message, 400, 'MCP_PROTOCOL_ERROR');
    this.details = details;
  }
}

/**
 * Tool Execution Error
 */
export class ToolExecutionError extends BaseError {
  constructor(toolName, originalError, input = {}) {
    const message = `Tool execution failed: ${toolName}`;
    super(message, 500, 'TOOL_EXECUTION_ERROR');
    this.toolName = toolName;
    this.originalError = originalError?.message || originalError;
    this.input = input;

    // Don't expose sensitive data in production
    if (process.env.NODE_ENV === 'production') {
      delete this.input.apiKey;
      delete this.input.password;
      delete this.input.token;
    }
  }
}

/**
 * Image Processing Error
 */
export class ImageProcessingError extends BaseError {
  constructor(operation, originalError) {
    super(`Image processing failed: ${operation}`, 422, 'IMAGE_PROCESSING_ERROR');
    this.operation = operation;
    this.originalError = originalError?.message || originalError;
  }
}

/**
 * Configuration Error
 */
export class ConfigurationError extends BaseError {
  constructor(message, missingFields = []) {
    super(message, 500, 'CONFIGURATION_ERROR', false);
    this.missingFields = missingFields;
  }
}

/**
 * Error handler utility functions
 */
export class ErrorHandler {
  /**
   * Determine if error is operational (expected) or programming error
   */
  static isOperationalError(error) {
    if (error instanceof BaseError) {
      return error.isOperational;
    }
    return false;
  }

  /**
   * Format error for MCP response
   */
  static formatMCPError(error, toolName = null) {
    if (error instanceof BaseError) {
      return {
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          ...(toolName && { tool: toolName }),
          ...(error.errors && { validationErrors: error.errors }),
          ...(error.retryAfter && { retryAfter: error.retryAfter }),
          timestamp: error.timestamp,
        },
      };
    }

    // Unknown error - be careful not to leak sensitive info
    return {
      error: {
        code: 'UNKNOWN_ERROR',
        message:
          process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
        statusCode: 500,
        ...(toolName && { tool: toolName }),
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Format error for HTTP response
   */
  static formatHTTPError(error) {
    if (error instanceof BaseError) {
      const response = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.errors && { errors: error.errors }),
          ...(error.retryAfter && { retryAfter: error.retryAfter }),
          ...(error.resource && { resource: error.resource }),
        },
      };

      return {
        statusCode: error.statusCode,
        body: response,
      };
    }

    // Unknown error
    return {
      statusCode: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message:
            process.env.NODE_ENV === 'production' ? 'An internal error occurred' : error.message,
        },
      },
    };
  }

  /**
   * Wrap async functions with error handling
   */
  static asyncWrapper(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (!ErrorHandler.isOperationalError(error)) {
          // Log programming errors
          console.error('Unexpected error:', error);
        }
        throw error;
      }
    };
  }

  /**
   * Create error from Ghost API response
   */
  static fromGhostError(error, operation) {
    const statusCode = error.response?.status || error.statusCode;
    const message = error.response?.data?.errors?.[0]?.message || error.message;

    return new GhostAPIError(operation, message, statusCode);
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error) {
    if (error instanceof RateLimitError) return true;
    if (error instanceof ExternalServiceError) return true;
    if (error instanceof GhostAPIError) {
      return [429, 502, 503, 504].includes(error.ghostStatusCode);
    }

    // Network errors
    if (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static getRetryDelay(attempt, error) {
    if (error instanceof RateLimitError) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }

    // Exponential backoff: 1s, 2s, 4s, 8s...
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;

    return Math.round(delay + jitter);
  }
}

/**
 * Circuit Breaker for external services
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  async execute(fn, ...args) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new ExternalServiceError(
          'Circuit breaker is OPEN',
          'Service temporarily unavailable'
        );
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.error(
        `Circuit breaker opened. Will retry at ${new Date(this.nextAttempt).toISOString()}`
      );
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
    };
  }
}

/**
 * Retry mechanism with exponential backoff
 */
export async function retryWithBackoff(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const onRetry = options.onRetry || (() => {});

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !ErrorHandler.isRetryable(error)) {
        throw error;
      }

      const delay = ErrorHandler.getRetryDelay(attempt, error);
      console.log(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`);

      await new Promise((resolve) => setTimeout(resolve, delay));
      onRetry(attempt, error);
    }
  }

  throw lastError;
}

export default {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  GhostAPIError,
  MCPProtocolError,
  ToolExecutionError,
  ImageProcessingError,
  ConfigurationError,
  ErrorHandler,
  CircuitBreaker,
  retryWithBackoff,
};
