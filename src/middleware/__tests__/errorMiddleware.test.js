import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
    rename: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock errors module
vi.mock('../../errors/index.js', () => ({
  ErrorHandler: {
    isOperationalError: vi.fn((error) => error.isOperational !== false),
    formatHTTPError: vi.fn((error) => ({
      statusCode: error.statusCode || 500,
      body: {
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
      },
    })),
  },
  ValidationError: class ValidationError extends Error {
    constructor(message, errors = []) {
      super(message);
      this.name = 'ValidationError';
      this.statusCode = 400;
      this.errors = errors;
    }
  },
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AuthenticationError';
      this.statusCode = 401;
    }
  },
  RateLimitError: class RateLimitError extends Error {
    constructor(retryAfter) {
      super('Rate limit exceeded');
      this.name = 'RateLimitError';
      this.statusCode = 429;
      this.retryAfter = retryAfter;
    }
  },
}));

import fs from 'fs/promises';
import {
  ErrorLogger,
  ErrorMetrics,
  expressErrorHandler,
  asyncHandler,
  validateRequest,
  RateLimiter,
  apiKeyAuth,
  mcpCors,
  healthCheck,
  GracefulShutdown,
  errorLogger,
  errorMetrics,
} from '../errorMiddleware.js';
import { ErrorHandler, ValidationError, AuthenticationError } from '../../errors/index.js';

// Helper to create mock request
function createMockRequest(overrides = {}) {
  return {
    method: 'GET',
    url: '/test',
    path: '/test',
    ip: '127.0.0.1',
    body: {},
    headers: {},
    get: vi.fn((header) => overrides.headers?.[header.toLowerCase()]),
    socket: {
      on: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    },
    ...overrides,
  };
}

// Helper to create mock response
function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
  };
  return res;
}

// Helper to create mock next function
function createMockNext() {
  return vi.fn();
}

describe('errorMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ErrorLogger', () => {
    describe('constructor', () => {
      it('should create logger with default options', () => {
        const logger = new ErrorLogger();
        expect(logger.maxLogSize).toBe(10 * 1024 * 1024);
        expect(logger.logLevel).toBeDefined();
        expect(logger.enableFileLogging).toBe(true);
      });

      it('should create logger with custom options', () => {
        const logger = new ErrorLogger({
          logDir: '/custom/path',
          maxLogSize: 5 * 1024 * 1024,
          logLevel: 'debug',
          enableFileLogging: false,
        });
        expect(logger.logDir).toBe('/custom/path');
        expect(logger.maxLogSize).toBe(5 * 1024 * 1024);
        expect(logger.logLevel).toBe('debug');
        expect(logger.enableFileLogging).toBe(false);
      });
    });

    describe('ensureLogDirectory', () => {
      it('should create log directory', async () => {
        fs.mkdir.mockResolvedValue(undefined);
        const logger = new ErrorLogger();
        await logger.ensureLogDirectory();
        expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      });

      it('should disable file logging on mkdir failure', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fs.mkdir.mockRejectedValue(new Error('Permission denied'));

        try {
          const logger = new ErrorLogger();
          await logger.ensureLogDirectory();
          expect(logger.enableFileLogging).toBe(false);
        } finally {
          consoleSpy.mockRestore();
        }
      });
    });

    describe('getLogFilePath', () => {
      it('should return dated log file path', () => {
        const logger = new ErrorLogger();
        const path = logger.getLogFilePath('error');
        const today = new Date().toISOString().split('T')[0];
        expect(path).toContain(`error-${today}.log`);
      });

      it('should use default type of error', () => {
        const logger = new ErrorLogger();
        const path = logger.getLogFilePath();
        expect(path).toContain('error-');
      });
    });

    describe('rotateLogIfNeeded', () => {
      it('should rotate log when file exceeds max size', async () => {
        fs.stat.mockResolvedValue({ size: 15 * 1024 * 1024 }); // 15MB

        const logger = new ErrorLogger();
        await logger.rotateLogIfNeeded('/path/to/error.log');

        expect(fs.rename).toHaveBeenCalled();
      });

      it('should not rotate when file is under max size', async () => {
        fs.stat.mockResolvedValue({ size: 5 * 1024 * 1024 }); // 5MB

        const logger = new ErrorLogger();
        await logger.rotateLogIfNeeded('/path/to/error.log');

        expect(fs.rename).not.toHaveBeenCalled();
      });

      it('should handle non-existent file gracefully', async () => {
        fs.stat.mockRejectedValue(new Error('ENOENT'));

        const logger = new ErrorLogger();
        // Should not throw
        await logger.rotateLogIfNeeded('/path/to/error.log');
      });
    });

    describe('formatLogEntry', () => {
      it('should format log entry as JSON', () => {
        const logger = new ErrorLogger();
        const entry = logger.formatLogEntry('error', 'Test message', { extra: 'data' });

        const parsed = JSON.parse(entry.trim());
        expect(parsed.level).toBe('error');
        expect(parsed.message).toBe('Test message');
        expect(parsed.extra).toBe('data');
        expect(parsed.timestamp).toBeDefined();
        expect(parsed.pid).toBe(process.pid);
      });
    });

    describe('writeToFile', () => {
      it('should write entry to file', async () => {
        fs.stat.mockResolvedValue({ size: 1000 });

        const logger = new ErrorLogger();
        logger.enableFileLogging = true;
        await logger.writeToFile('error', 'test entry');

        expect(fs.appendFile).toHaveBeenCalled();
      });

      it('should not write when file logging is disabled', async () => {
        const logger = new ErrorLogger({ enableFileLogging: false });
        await logger.writeToFile('error', 'test entry');

        expect(fs.appendFile).not.toHaveBeenCalled();
      });

      it('should handle write errors gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fs.stat.mockResolvedValue({ size: 1000 });
        fs.appendFile.mockRejectedValue(new Error('Write failed'));

        const logger = new ErrorLogger();
        logger.enableFileLogging = true;
        await logger.writeToFile('error', 'test entry');

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('logError', () => {
      it('should log operational error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        ErrorHandler.isOperationalError.mockReturnValue(true);

        const logger = new ErrorLogger();
        logger.enableFileLogging = false;
        const error = new Error('Test error');
        error.statusCode = 400;

        await logger.logError(error);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[ERROR]'),
          expect.any(String)
        );
        consoleSpy.mockRestore();
      });

      it('should log fatal error with full details', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        ErrorHandler.isOperationalError.mockReturnValue(false);

        const logger = new ErrorLogger();
        logger.enableFileLogging = false;
        const error = new Error('Fatal error');

        await logger.logError(error);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[FATAL]'),
          expect.any(String),
          expect.any(Object)
        );
        consoleSpy.mockRestore();
      });

      it('should include context in log', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const logger = new ErrorLogger();
        logger.enableFileLogging = false;
        const error = new Error('Test error');

        await logger.logError(error, { requestId: '123' });

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('logInfo', () => {
      it('should log info message when level allows', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        const logger = new ErrorLogger({ logLevel: 'info', enableFileLogging: false });
        await logger.logInfo('Info message');

        expect(consoleSpy).toHaveBeenCalledWith('[INFO] Info message');
        consoleSpy.mockRestore();
      });

      it('should not log when level is higher', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        const logger = new ErrorLogger({ logLevel: 'error', enableFileLogging: false });
        await logger.logInfo('Info message');

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('logWarning', () => {
      it('should log warning message when level allows', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const logger = new ErrorLogger({ logLevel: 'warning', enableFileLogging: false });
        await logger.logWarning('Warning message');

        expect(consoleSpy).toHaveBeenCalledWith('[WARNING] Warning message');
        consoleSpy.mockRestore();
      });
    });

    describe('logDebug', () => {
      it('should log debug message when level is debug', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        const logger = new ErrorLogger({ logLevel: 'debug', enableFileLogging: false });
        await logger.logDebug('Debug message');

        expect(consoleSpy).toHaveBeenCalledWith('[DEBUG] Debug message');
        consoleSpy.mockRestore();
      });

      it('should not log when level is not debug', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        const logger = new ErrorLogger({ logLevel: 'info', enableFileLogging: false });
        await logger.logDebug('Debug message');

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });
  });

  describe('ErrorMetrics', () => {
    describe('constructor', () => {
      it('should initialize with default metrics', () => {
        const metrics = new ErrorMetrics();
        expect(metrics.metrics.totalErrors).toBe(0);
        expect(metrics.metrics.errorsByType).toEqual({});
        expect(metrics.metrics.errorsByStatusCode).toEqual({});
        expect(metrics.metrics.errorsByEndpoint).toEqual({});
      });
    });

    describe('recordError', () => {
      it('should increment total errors', () => {
        const metrics = new ErrorMetrics();
        metrics.recordError(new Error('Test'));
        expect(metrics.metrics.totalErrors).toBe(1);
      });

      it('should count errors by type', () => {
        const metrics = new ErrorMetrics();
        const error = new ValidationError('Test');
        metrics.recordError(error);
        expect(metrics.metrics.errorsByType['ValidationError']).toBe(1);
      });

      it('should count errors by status code', () => {
        const metrics = new ErrorMetrics();
        const error = new Error('Test');
        error.statusCode = 400;
        metrics.recordError(error);
        expect(metrics.metrics.errorsByStatusCode[400]).toBe(1);
      });

      it('should default status code to 500', () => {
        const metrics = new ErrorMetrics();
        metrics.recordError(new Error('Test'));
        expect(metrics.metrics.errorsByStatusCode[500]).toBe(1);
      });

      it('should count errors by endpoint when provided', () => {
        const metrics = new ErrorMetrics();
        metrics.recordError(new Error('Test'), 'GET /api/test');
        expect(metrics.metrics.errorsByEndpoint['GET /api/test']).toBe(1);
      });

      it('should not count endpoint when not provided', () => {
        const metrics = new ErrorMetrics();
        metrics.recordError(new Error('Test'));
        expect(Object.keys(metrics.metrics.errorsByEndpoint)).toHaveLength(0);
      });
    });

    describe('getMetrics', () => {
      it('should return metrics with system info', () => {
        const metrics = new ErrorMetrics();
        const result = metrics.getMetrics();

        expect(result.totalErrors).toBe(0);
        expect(result.uptime).toBeDefined();
        expect(result.memoryUsage).toBeDefined();
        expect(result.timestamp).toBeDefined();
      });
    });

    describe('reset', () => {
      it('should reset all metrics', () => {
        const metrics = new ErrorMetrics();
        metrics.recordError(new Error('Test'));
        metrics.reset();

        expect(metrics.metrics.totalErrors).toBe(0);
        expect(metrics.metrics.errorsByType).toEqual({});
      });

      it('should update lastReset timestamp', () => {
        const metrics = new ErrorMetrics();
        const originalReset = metrics.metrics.lastReset;

        vi.advanceTimersByTime(1000);
        metrics.reset();

        expect(metrics.metrics.lastReset).not.toBe(originalReset);
      });
    });
  });

  describe('expressErrorHandler', () => {
    it('should log error and record metrics', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Test error');

      expressErrorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should set security headers', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Test error');

      expressErrorHandler(error, req, res, next);

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
        })
      );
    });

    it('should use error statusCode when available', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Bad request');
      error.statusCode = 400;

      ErrorHandler.formatHTTPError.mockReturnValue({
        statusCode: 400,
        body: { error: { message: 'Bad request' } },
      });

      expressErrorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('asyncHandler', () => {
    it('should call next with error when async function rejects', async () => {
      const error = new Error('Async error');
      const asyncFn = vi.fn().mockRejectedValue(error);
      const handler = asyncHandler(asyncFn);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should not call next when async function resolves', async () => {
      const asyncFn = vi.fn().mockResolvedValue(undefined);
      const handler = asyncHandler(asyncFn);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await handler(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it('should pass req, res, next to wrapped function', async () => {
      const asyncFn = vi.fn().mockResolvedValue(undefined);
      const handler = asyncHandler(asyncFn);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await handler(req, res, next);

      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    });
  });

  describe('validateRequest', () => {
    describe('with function schema', () => {
      it('should call next when validation passes', () => {
        const schema = vi.fn().mockReturnValue({ error: null });
        const middleware = validateRequest(schema);

        const req = createMockRequest({ body: { name: 'test' } });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should call next with error when validation fails', () => {
        const schema = vi.fn().mockReturnValue({ error: 'Invalid input' });
        const middleware = validateRequest(schema);

        const req = createMockRequest({ body: {} });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      });
    });

    describe('with Joi-like schema', () => {
      it('should call next when validation passes', () => {
        const schema = {
          validate: vi.fn().mockReturnValue({ error: null }),
        };
        const middleware = validateRequest(schema);

        const req = createMockRequest({ body: { name: 'test' } });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should call next with ValidationError when validation fails', () => {
        const schema = {
          validate: vi.fn().mockReturnValue({
            error: {
              details: [{ message: 'Name is required' }],
            },
          }),
        };
        const middleware = validateRequest(schema);

        const req = createMockRequest({ body: {} });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      });
    });

    describe('with object schema', () => {
      it('should call next when required fields are present', () => {
        const schema = {
          name: { required: true, type: 'string' },
        };
        const middleware = validateRequest(schema);

        const req = createMockRequest({ body: { name: 'test' } });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should call next with error when required field is missing', () => {
        const schema = {
          name: { required: true },
        };
        const middleware = validateRequest(schema);

        const req = createMockRequest({ body: {} });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      });

      it('should call next with error when type is wrong', () => {
        const schema = {
          name: { type: 'string' },
        };
        const middleware = validateRequest(schema);

        const req = createMockRequest({ body: { name: 123 } });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      });
    });
  });

  describe('RateLimiter', () => {
    describe('constructor', () => {
      it('should use default options', () => {
        const limiter = new RateLimiter();
        expect(limiter.windowMs).toBe(60000);
        expect(limiter.maxRequests).toBe(100);
      });

      it('should accept custom options', () => {
        const limiter = new RateLimiter({
          windowMs: 30000,
          maxRequests: 50,
        });
        expect(limiter.windowMs).toBe(30000);
        expect(limiter.maxRequests).toBe(50);
      });
    });

    describe('middleware', () => {
      it('should allow requests under limit', () => {
        const limiter = new RateLimiter({ maxRequests: 5 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should block requests over limit', () => {
        const limiter = new RateLimiter({ maxRequests: 2 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // First two requests should pass
        middleware(req, res, next);
        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(2);

        // Third request should be rate limited
        middleware(req, res, next);
        expect(next).toHaveBeenLastCalledWith(expect.any(Error));
      });

      it('should reset after window expires', () => {
        const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);
        expect(next).toHaveBeenCalledWith();

        // Advance time past window
        vi.advanceTimersByTime(1500);

        next.mockClear();
        middleware(req, res, next);
        expect(next).toHaveBeenCalledWith();
      });

      it('should track requests by IP', () => {
        const limiter = new RateLimiter({ maxRequests: 1 });
        const middleware = limiter.middleware();

        const req1 = createMockRequest({ ip: '1.1.1.1' });
        const req2 = createMockRequest({ ip: '2.2.2.2' });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req1, res, next);
        middleware(req2, res, next);

        // Both should pass because they're different IPs
        expect(next).toHaveBeenCalledTimes(2);
        expect(next).toHaveBeenNthCalledWith(1);
        expect(next).toHaveBeenNthCalledWith(2);
      });
    });

    describe('cleanup', () => {
      it('should remove old entries', () => {
        const limiter = new RateLimiter({ windowMs: 1000 });

        // Add some requests
        limiter.requests.set('1.1.1.1', [Date.now() - 2000]);
        limiter.requests.set('2.2.2.2', [Date.now()]);

        limiter.cleanup(Date.now());

        expect(limiter.requests.has('1.1.1.1')).toBe(false);
        expect(limiter.requests.has('2.2.2.2')).toBe(true);
      });
    });
  });

  describe('apiKeyAuth', () => {
    it('should call next when API key is valid', () => {
      const middleware = apiKeyAuth('test-api-key');

      const req = createMockRequest({
        headers: { 'x-api-key': 'test-api-key' },
      });
      req.get = vi.fn().mockReturnValue(null);
      req.headers = { 'x-api-key': 'test-api-key' };
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next with error when API key is missing', () => {
      const middleware = apiKeyAuth('test-api-key');

      const req = createMockRequest();
      req.get = vi.fn().mockReturnValue(null);
      req.headers = {};
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('should call next with error when API key is invalid', () => {
      const middleware = apiKeyAuth('test-api-key');

      const req = createMockRequest();
      req.get = vi.fn().mockReturnValue(null);
      req.headers = { 'x-api-key': 'wrong-key' };
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('should accept Bearer token in authorization header', () => {
      const middleware = apiKeyAuth('test-api-key');

      const req = createMockRequest();
      req.get = vi.fn().mockReturnValue(null);
      req.headers = { authorization: 'Bearer test-api-key' };
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject keys of different length', () => {
      const middleware = apiKeyAuth('test-api-key');

      const req = createMockRequest();
      req.get = vi.fn().mockReturnValue(null);
      req.headers = { 'x-api-key': 'short' };
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('mcpCors', () => {
    it('should set CORS headers for allowed origin', () => {
      const middleware = mcpCors(['http://localhost:3000']);

      const req = createMockRequest({
        headers: { origin: 'http://localhost:3000' },
        method: 'GET',
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.header).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://localhost:3000'
      );
      expect(next).toHaveBeenCalled();
    });

    it('should allow all origins when wildcard is used', () => {
      const middleware = mcpCors(['*']);

      const req = createMockRequest({
        headers: { origin: 'http://any-origin.com' },
        method: 'GET',
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.header).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://any-origin.com'
      );
    });

    it('should handle OPTIONS preflight request', () => {
      const middleware = mcpCors(['*']);

      const req = createMockRequest({
        method: 'OPTIONS',
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.sendStatus).toHaveBeenCalledWith(204);
      expect(next).not.toHaveBeenCalled();
    });

    it('should set all required CORS headers', () => {
      const middleware = mcpCors(['*']);

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.header).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      expect(res.header).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-API-Key'
      );
      expect(res.header).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when service is healthy', async () => {
      const mockGhostService = {
        checkHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
      };
      const handler = healthCheck(mockGhostService);

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
        })
      );
    });

    it('should return unhealthy status when service is unhealthy', async () => {
      const mockGhostService = {
        checkHealth: vi.fn().mockResolvedValue({ status: 'unhealthy' }),
      };
      const handler = healthCheck(mockGhostService);

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it('should handle health check errors', async () => {
      const mockGhostService = {
        checkHealth: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      const handler = healthCheck(mockGhostService);

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          error: 'Connection failed',
        })
      );
    });

    it('should include metrics in response', async () => {
      const mockGhostService = {
        checkHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
      };
      const handler = healthCheck(mockGhostService);

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.objectContaining({
            errors: expect.any(Number),
            uptime: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('GracefulShutdown', () => {
    describe('constructor', () => {
      it('should initialize with default values', () => {
        const shutdown = new GracefulShutdown();
        expect(shutdown.isShuttingDown).toBe(false);
        expect(shutdown.connections.size).toBe(0);
      });
    });

    describe('trackConnection', () => {
      it('should add connection to set', () => {
        const shutdown = new GracefulShutdown();
        const mockConnection = { on: vi.fn() };

        shutdown.trackConnection(mockConnection);

        expect(shutdown.connections.has(mockConnection)).toBe(true);
      });

      it('should remove connection on close event', () => {
        const shutdown = new GracefulShutdown();
        const mockConnection = { on: vi.fn() };

        shutdown.trackConnection(mockConnection);

        // Simulate close event
        const closeCallback = mockConnection.on.mock.calls.find((c) => c[0] === 'close')[1];
        closeCallback();

        expect(shutdown.connections.has(mockConnection)).toBe(false);
      });
    });

    describe('middleware', () => {
      it('should call next when not shutting down', () => {
        const shutdown = new GracefulShutdown();
        const middleware = shutdown.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      it('should return 503 when shutting down', () => {
        const shutdown = new GracefulShutdown();
        shutdown.isShuttingDown = true;
        const middleware = shutdown.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.set).toHaveBeenCalledWith('Connection', 'close');
        expect(next).not.toHaveBeenCalled();
      });

      it('should track connection', () => {
        const shutdown = new GracefulShutdown();
        const middleware = shutdown.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(shutdown.connections.has(req.socket)).toBe(true);
      });
    });

    describe('shutdown', () => {
      it('should set isShuttingDown flag', async () => {
        const shutdown = new GracefulShutdown();
        const mockServer = { close: vi.fn() };

        // Don't await - just start shutdown
        shutdown.shutdown(mockServer);

        expect(shutdown.isShuttingDown).toBe(true);
      });

      it('should close server', async () => {
        const shutdown = new GracefulShutdown();
        const mockServer = { close: vi.fn((cb) => cb()) };

        shutdown.shutdown(mockServer);

        expect(mockServer.close).toHaveBeenCalled();
      });

      it('should end all connections', async () => {
        const shutdown = new GracefulShutdown();
        const mockConnection = { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
        shutdown.trackConnection(mockConnection);

        const mockServer = { close: vi.fn() };
        shutdown.shutdown(mockServer);

        expect(mockConnection.end).toHaveBeenCalled();
      });

      it('should force destroy connections after timeout', async () => {
        const shutdown = new GracefulShutdown();
        const mockConnection = { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
        shutdown.trackConnection(mockConnection);

        const mockServer = { close: vi.fn() };
        shutdown.shutdown(mockServer);

        vi.advanceTimersByTime(10000);

        expect(mockConnection.destroy).toHaveBeenCalled();
      });

      it('should not shutdown twice', async () => {
        const shutdown = new GracefulShutdown();
        shutdown.isShuttingDown = true;

        const mockServer = { close: vi.fn() };
        await shutdown.shutdown(mockServer);

        expect(mockServer.close).not.toHaveBeenCalled();
      });
    });
  });

  describe('global instances', () => {
    it('should export errorLogger instance', () => {
      expect(errorLogger).toBeInstanceOf(ErrorLogger);
    });

    it('should export errorMetrics instance', () => {
      expect(errorMetrics).toBeInstanceOf(ErrorMetrics);
    });
  });
});
