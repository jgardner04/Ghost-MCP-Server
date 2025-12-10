import {
  ErrorHandler,
  BaseError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
} from '../errors/index.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Error Logger - Logs errors to file and console
 */
export class ErrorLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
    this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
    this.enableFileLogging = options.enableFileLogging ?? true;

    // Ensure log directory exists
    if (this.enableFileLogging) {
      this.ensureLogDirectory();
    }
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
      this.enableFileLogging = false;
    }
  }

  getLogFilePath(type = 'error') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${type}-${date}.log`);
  }

  async rotateLogIfNeeded(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxLogSize) {
        const timestamp = Date.now();
        const rotatedPath = filePath.replace('.log', `-${timestamp}.log`);
        await fs.rename(filePath, rotatedPath);
      }
    } catch (error) {
      // File doesn't exist yet, which is fine
    }
  }

  formatLogEntry(level, message, meta = {}) {
    return (
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
      }) + '\n'
    );
  }

  async writeToFile(type, entry) {
    if (!this.enableFileLogging) return;

    const filePath = this.getLogFilePath(type);

    try {
      await this.rotateLogIfNeeded(filePath);
      await fs.appendFile(filePath, entry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  async logError(error, context = {}) {
    const isOperational = ErrorHandler.isOperationalError(error);
    const level = isOperational ? 'error' : 'fatal';

    const logData = {
      name: error.name || 'Error',
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
      isOperational,
      ...context,
    };

    // Console logging
    if (level === 'fatal' || this.logLevel === 'debug') {
      console.error(`[${level.toUpperCase()}]`, error.message, logData);
    } else {
      console.error(`[${level.toUpperCase()}]`, error.message);
    }

    // File logging
    const entry = this.formatLogEntry(level, error.message, logData);
    await this.writeToFile('error', entry);

    // Also log to general log
    await this.writeToFile('app', entry);
  }

  async logInfo(message, meta = {}) {
    if (['info', 'debug'].includes(this.logLevel)) {
      console.log(`[INFO] ${message}`);
      const entry = this.formatLogEntry('info', message, meta);
      await this.writeToFile('app', entry);
    }
  }

  async logWarning(message, meta = {}) {
    if (['warning', 'info', 'debug'].includes(this.logLevel)) {
      console.warn(`[WARNING] ${message}`);
      const entry = this.formatLogEntry('warning', message, meta);
      await this.writeToFile('app', entry);
    }
  }

  async logDebug(message, meta = {}) {
    if (this.logLevel === 'debug') {
      console.log(`[DEBUG] ${message}`);
      const entry = this.formatLogEntry('debug', message, meta);
      await this.writeToFile('debug', entry);
    }
  }
}

/**
 * Error Metrics Collector
 */
export class ErrorMetrics {
  constructor() {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByStatusCode: {},
      errorsByEndpoint: {},
      lastReset: new Date().toISOString(),
    };
  }

  recordError(error, endpoint = null) {
    this.metrics.totalErrors++;

    // Count by error type
    const errorType = error.constructor.name;
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;

    // Count by status code
    const statusCode = error.statusCode || 500;
    this.metrics.errorsByStatusCode[statusCode] =
      (this.metrics.errorsByStatusCode[statusCode] || 0) + 1;

    // Count by endpoint
    if (endpoint) {
      this.metrics.errorsByEndpoint[endpoint] = (this.metrics.errorsByEndpoint[endpoint] || 0) + 1;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  reset() {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByStatusCode: {},
      errorsByEndpoint: {},
      lastReset: new Date().toISOString(),
    };
  }
}

// Global instances
const errorLogger = new ErrorLogger();
const errorMetrics = new ErrorMetrics();

/**
 * Express Error Middleware
 */
export function expressErrorHandler(err, req, res, next) {
  // Log the error
  errorLogger.logError(err, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Record metrics
  errorMetrics.recordError(err, `${req.method} ${req.path}`);

  // Format response
  const { statusCode, body } = ErrorHandler.formatHTTPError(err);

  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  });

  // Send response
  res.status(statusCode).json(body);
}

/**
 * Async route wrapper to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Request validation middleware
 * @param {Object|Function} schema - Validation schema object or validation function
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    try {
      // If schema is a function, call it with the request body
      if (typeof schema === 'function') {
        const validationResult = schema(req.body);
        if (validationResult && validationResult.error) {
          throw new ValidationError(validationResult.error);
        }
      }
      // If schema has a validate method (e.g., Joi schema)
      else if (schema && typeof schema.validate === 'function') {
        const { error } = schema.validate(req.body, { abortEarly: false });
        if (error) {
          // Create ValidationError from Joi error details
          const errors = error.details
            ? error.details.map((detail) => detail.message)
            : [error.message];
          throw new ValidationError('Validation failed', errors);
        }
      }
      // If schema is a simple object with required fields
      else if (schema && typeof schema === 'object') {
        const errors = [];
        for (const [field, rules] of Object.entries(schema)) {
          if (rules.required && !req.body[field]) {
            errors.push(`${field} is required`);
          }
          if (rules.type && req.body[field] && typeof req.body[field] !== rules.type) {
            errors.push(`${field} must be of type ${rules.type}`);
          }
        }
        if (errors.length > 0) {
          throw new ValidationError('Validation failed', errors);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Rate limiting middleware
 */
export class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.requests = new Map();
  }

  middleware() {
    return (req, res, next) => {
      const key = req.ip;
      const now = Date.now();

      // Clean old entries
      this.cleanup(now);

      // Get or create request list for this IP
      if (!this.requests.has(key)) {
        this.requests.set(key, []);
      }

      const requestTimes = this.requests.get(key);
      requestTimes.push(now);

      if (requestTimes.length > this.maxRequests) {
        const retryAfter = Math.ceil((this.windowMs - (now - requestTimes[0])) / 1000);
        return next(new RateLimitError(retryAfter));
      }

      next();
    };
  }

  cleanup(now) {
    const cutoff = now - this.windowMs;

    for (const [key, times] of this.requests.entries()) {
      const filtered = times.filter((time) => time > cutoff);

      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}

/**
 * API Key authentication middleware
 */
export function apiKeyAuth(apiKey) {
  return (req, res, next) => {
    const providedKey =
      req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!providedKey) {
      return next(new AuthenticationError('API key is required'));
    }

    // Use timing-safe comparison to prevent timing attacks
    const expectedKeyBuffer = Buffer.from(apiKey, 'utf8');
    const providedKeyBuffer = Buffer.from(providedKey, 'utf8');

    // Ensure buffers are same length to prevent timing attacks
    if (expectedKeyBuffer.length !== providedKeyBuffer.length) {
      return next(new AuthenticationError('Invalid API key'));
    }

    // Use constant-time comparison
    const isValid = crypto.timingSafeEqual(expectedKeyBuffer, providedKeyBuffer);

    if (!isValid) {
      return next(new AuthenticationError('Invalid API key'));
    }

    next();
  };
}

/**
 * CORS middleware for MCP
 */
export function mcpCors(allowedOrigins = ['*']) {
  return (req, res, next) => {
    const origin = req.headers.origin;

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      res.header('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
}

/**
 * Health check endpoint
 */
export function healthCheck(ghostService) {
  return async (req, res) => {
    try {
      const health = await ghostService.checkHealth();
      const metrics = errorMetrics.getMetrics();

      const status = health.status === 'healthy' ? 200 : 503;

      res.status(status).json({
        ...health,
        metrics: {
          errors: metrics.totalErrors,
          uptime: metrics.uptime,
          memory: metrics.memoryUsage,
        },
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Graceful shutdown handler
 */
export class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.connections = new Set();
  }

  trackConnection(connection) {
    this.connections.add(connection);
    connection.on('close', () => this.connections.delete(connection));
  }

  middleware() {
    return (req, res, next) => {
      if (this.isShuttingDown) {
        res.set('Connection', 'close');
        res.status(503).json({
          error: {
            code: 'SERVER_SHUTTING_DOWN',
            message: 'Server is shutting down',
          },
        });
        return;
      }

      // Track the connection
      this.trackConnection(req.socket);
      next();
    };
  }

  async shutdown(server) {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    console.log('Graceful shutdown initiated...');

    // Stop accepting new connections
    server.close(() => {
      console.log('Server closed to new connections');
    });

    // Close existing connections
    for (const connection of this.connections) {
      connection.end();
    }

    // Force close after timeout
    setTimeout(() => {
      for (const connection of this.connections) {
        connection.destroy();
      }
    }, 10000);

    // Log final metrics
    await errorLogger.logInfo('Shutdown metrics', errorMetrics.getMetrics());
  }
}

export { errorLogger, errorMetrics };

export default {
  expressErrorHandler,
  asyncHandler,
  validateRequest,
  RateLimiter,
  apiKeyAuth,
  mcpCors,
  healthCheck,
  GracefulShutdown,
  ErrorLogger,
  ErrorMetrics,
  errorLogger,
  errorMetrics,
};
