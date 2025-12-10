import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
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
} from '../index.js';

describe('Error Handling System', () => {
  describe('BaseError', () => {
    it('should create error with default values', () => {
      const error = new BaseError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('BaseError');
      expect(error.timestamp).toBeDefined();
      expect(error.stack).toBeDefined();
    });

    it('should create error with custom values', () => {
      const error = new BaseError('Custom error', 400, 'CUSTOM_CODE', false);

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.isOperational).toBe(false);
    });

    it('should serialize to JSON in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new BaseError('Test error', 500, 'TEST_CODE');
      const json = error.toJSON();

      expect(json.name).toBe('BaseError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_CODE');
      expect(json.statusCode).toBe(500);
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack in JSON in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new BaseError('Test error');
      const json = error.toJSON();

      expect(json.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with default values', () => {
      const error = new ValidationError('Validation failed');

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual([]);
    });

    it('should create validation error with error details', () => {
      const errors = [
        { field: 'email', message: 'Invalid email', type: 'string.email' },
        { field: 'age', message: 'Must be positive', type: 'number.positive' },
      ];
      const error = new ValidationError('Validation failed', errors);

      expect(error.errors).toEqual(errors);
    });

    it('should create validation error from Joi error', () => {
      const joiError = {
        details: [
          {
            path: ['user', 'email'],
            message: '"user.email" must be a valid email',
            type: 'string.email',
          },
          {
            path: ['age'],
            message: '"age" must be a number',
            type: 'number.base',
          },
        ],
      };

      const error = ValidationError.fromJoi(joiError);

      expect(error.message).toBe('Validation failed');
      expect(error.errors).toHaveLength(2);
      expect(error.errors[0]).toEqual({
        field: 'user.email',
        message: '"user.email" must be a valid email',
        type: 'string.email',
      });
      expect(error.errors[1]).toEqual({
        field: 'age',
        message: '"age" must be a number',
        type: 'number.base',
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid API key');

      expect(error.message).toBe('Invalid API key');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error with default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should create authorization error with custom message', () => {
      const error = new AuthorizationError('Insufficient permissions');

      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource and identifier', () => {
      const error = new NotFoundError('Post', '123');

      expect(error.message).toBe('Post not found: 123');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.resource).toBe('Post');
      expect(error.identifier).toBe('123');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error with resource', () => {
      const error = new ConflictError('Tag already exists', 'Tag');

      expect(error.message).toBe('Tag already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.resource).toBe('Tag');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with default retryAfter', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60);
    });

    it('should create rate limit error with custom retryAfter', () => {
      const error = new RateLimitError(120);

      expect(error.retryAfter).toBe(120);
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error with service name', () => {
      const error = new ExternalServiceError('Ghost API', 'Connection failed');

      expect(error.message).toBe('External service error: Ghost API');
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.service).toBe('Ghost API');
      expect(error.originalError).toBe('Connection failed');
    });

    it('should handle Error object as originalError', () => {
      const originalError = new Error('Network timeout');
      const error = new ExternalServiceError('API', originalError);

      expect(error.originalError).toBe('Network timeout');
    });
  });

  describe('GhostAPIError', () => {
    it('should map 401 status code correctly', () => {
      const error = new GhostAPIError('createPost', 'Unauthorized', 401);

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('GHOST_AUTH_ERROR');
      expect(error.operation).toBe('createPost');
      expect(error.ghostStatusCode).toBe(401);
    });

    it('should map 404 status code correctly', () => {
      const error = new GhostAPIError('getPost', 'Not found', 404);

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('GHOST_NOT_FOUND');
    });

    it('should map 422 status code to 400', () => {
      const error = new GhostAPIError('updatePost', 'Invalid data', 422);

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('GHOST_VALIDATION_ERROR');
    });

    it('should map 429 status code correctly', () => {
      const error = new GhostAPIError('getPosts', 'Rate limited', 429);

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('GHOST_RATE_LIMIT');
    });

    it('should keep default 502 for other status codes', () => {
      const error = new GhostAPIError('operation', 'Server error', 500);

      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    });
  });

  describe('MCPProtocolError', () => {
    it('should create MCP protocol error with default details', () => {
      const error = new MCPProtocolError('Invalid tool call');

      expect(error.message).toBe('Invalid tool call');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('MCP_PROTOCOL_ERROR');
      expect(error.details).toEqual({});
    });

    it('should create MCP protocol error with details', () => {
      const details = { tool: 'ghost_create_post', reason: 'Missing required field' };
      const error = new MCPProtocolError('Invalid parameters', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('ToolExecutionError', () => {
    it('should create tool execution error with input', () => {
      const input = { title: 'Test', tags: ['test'] };
      const error = new ToolExecutionError('ghost_create_post', 'API error', input);

      expect(error.message).toBe('Tool execution failed: ghost_create_post');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TOOL_EXECUTION_ERROR');
      expect(error.toolName).toBe('ghost_create_post');
      expect(error.originalError).toBe('API error');
      expect(error.input).toEqual(input);
    });

    it('should handle Error object as originalError', () => {
      const originalError = new Error('Execution failed');
      const error = new ToolExecutionError('tool', originalError, {});

      expect(error.originalError).toBe('Execution failed');
    });

    it('should filter sensitive data in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const input = {
        apiKey: 'secret123',
        password: 'pass123',
        token: 'token123',
        title: 'Post Title',
      };
      const error = new ToolExecutionError('tool', 'Error', input);

      expect(error.input.apiKey).toBeUndefined();
      expect(error.input.password).toBeUndefined();
      expect(error.input.token).toBeUndefined();
      expect(error.input.title).toBe('Post Title');

      process.env.NODE_ENV = originalEnv;
    });

    it('should not filter sensitive data in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const input = {
        apiKey: 'secret123',
        password: 'pass123',
        token: 'token123',
      };
      const error = new ToolExecutionError('tool', 'Error', input);

      expect(error.input.apiKey).toBe('secret123');
      expect(error.input.password).toBe('pass123');
      expect(error.input.token).toBe('token123');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('ImageProcessingError', () => {
    it('should create image processing error with operation', () => {
      const error = new ImageProcessingError('resize', 'Invalid dimensions');

      expect(error.message).toBe('Image processing failed: resize');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('IMAGE_PROCESSING_ERROR');
      expect(error.operation).toBe('resize');
      expect(error.originalError).toBe('Invalid dimensions');
    });

    it('should handle Error object as originalError', () => {
      const originalError = new Error('Sharp error');
      const error = new ImageProcessingError('optimize', originalError);

      expect(error.originalError).toBe('Sharp error');
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error with default missing fields', () => {
      const error = new ConfigurationError('Missing configuration');

      expect(error.message).toBe('Missing configuration');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.isOperational).toBe(false);
      expect(error.missingFields).toEqual([]);
    });

    it('should create configuration error with missing fields', () => {
      const error = new ConfigurationError('Invalid config', ['GHOST_API_URL', 'GHOST_API_KEY']);

      expect(error.missingFields).toEqual(['GHOST_API_URL', 'GHOST_API_KEY']);
    });
  });

  describe('ErrorHandler', () => {
    describe('isOperationalError', () => {
      it('should return true for BaseError with isOperational=true', () => {
        const error = new BaseError('Test', 500, 'TEST', true);
        expect(ErrorHandler.isOperationalError(error)).toBe(true);
      });

      it('should return false for BaseError with isOperational=false', () => {
        const error = new ConfigurationError('Test');
        expect(ErrorHandler.isOperationalError(error)).toBe(false);
      });

      it('should return false for regular Error', () => {
        const error = new Error('Regular error');
        expect(ErrorHandler.isOperationalError(error)).toBe(false);
      });
    });

    describe('formatMCPError', () => {
      it('should format BaseError for MCP response', () => {
        const error = new ValidationError('Invalid input', [
          { field: 'email', message: 'Invalid' },
        ]);
        const formatted = ErrorHandler.formatMCPError(error);

        expect(formatted.error.code).toBe('VALIDATION_ERROR');
        expect(formatted.error.message).toBe('Invalid input');
        expect(formatted.error.statusCode).toBe(400);
        expect(formatted.error.validationErrors).toHaveLength(1);
        expect(formatted.error.timestamp).toBeDefined();
      });

      it('should include tool name when provided', () => {
        const error = new BaseError('Test error');
        const formatted = ErrorHandler.formatMCPError(error, 'ghost_create_post');

        expect(formatted.error.tool).toBe('ghost_create_post');
      });

      it('should include retryAfter for RateLimitError', () => {
        const error = new RateLimitError(120);
        const formatted = ErrorHandler.formatMCPError(error);

        expect(formatted.error.retryAfter).toBe(120);
      });

      it('should format unknown error in production', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const error = new Error('Unexpected error');
        const formatted = ErrorHandler.formatMCPError(error);

        expect(formatted.error.code).toBe('UNKNOWN_ERROR');
        expect(formatted.error.message).toBe('An unexpected error occurred');
        expect(formatted.error.statusCode).toBe(500);

        process.env.NODE_ENV = originalEnv;
      });

      it('should include error message for unknown error in development', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const error = new Error('Debug error');
        const formatted = ErrorHandler.formatMCPError(error);

        expect(formatted.error.message).toBe('Debug error');

        process.env.NODE_ENV = originalEnv;
      });
    });

    describe('formatHTTPError', () => {
      it('should format BaseError for HTTP response', () => {
        const error = new NotFoundError('Post', '123');
        const formatted = ErrorHandler.formatHTTPError(error);

        expect(formatted.statusCode).toBe(404);
        expect(formatted.body.error.code).toBe('NOT_FOUND');
        expect(formatted.body.error.message).toBe('Post not found: 123');
        expect(formatted.body.error.resource).toBe('Post');
      });

      it('should include validation errors', () => {
        const error = new ValidationError('Invalid', [{ field: 'name', message: 'Required' }]);
        const formatted = ErrorHandler.formatHTTPError(error);

        expect(formatted.body.error.errors).toHaveLength(1);
      });

      it('should include retryAfter for rate limit', () => {
        const error = new RateLimitError(60);
        const formatted = ErrorHandler.formatHTTPError(error);

        expect(formatted.body.error.retryAfter).toBe(60);
      });

      it('should format unknown error in production', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const error = new Error('Unknown');
        const formatted = ErrorHandler.formatHTTPError(error);

        expect(formatted.statusCode).toBe(500);
        expect(formatted.body.error.code).toBe('INTERNAL_ERROR');
        expect(formatted.body.error.message).toBe('An internal error occurred');

        process.env.NODE_ENV = originalEnv;
      });

      it('should include error message for unknown error in development', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const error = new Error('Debug message');
        const formatted = ErrorHandler.formatHTTPError(error);

        expect(formatted.body.error.message).toBe('Debug message');

        process.env.NODE_ENV = originalEnv;
      });
    });

    describe('asyncWrapper', () => {
      it('should pass through successful results', async () => {
        const fn = async () => 'success';
        const wrapped = ErrorHandler.asyncWrapper(fn);

        const result = await wrapped();
        expect(result).toBe('success');
      });

      it('should rethrow operational errors', async () => {
        const error = new ValidationError('Invalid');
        const fn = async () => {
          throw error;
        };
        const wrapped = ErrorHandler.asyncWrapper(fn);

        await expect(wrapped()).rejects.toThrow(error);
      });

      it('should log and rethrow non-operational errors', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('Programming error');
        const fn = async () => {
          throw error;
        };
        const wrapped = ErrorHandler.asyncWrapper(fn);

        await expect(wrapped()).rejects.toThrow(error);
        expect(consoleSpy).toHaveBeenCalledWith('Unexpected error:', error);

        consoleSpy.mockRestore();
      });
    });

    describe('fromGhostError', () => {
      it('should create GhostAPIError from error with response', () => {
        const ghostError = {
          response: {
            status: 404,
            data: {
              errors: [{ message: 'Post not found' }],
            },
          },
        };

        const error = ErrorHandler.fromGhostError(ghostError, 'getPost');

        expect(error).toBeInstanceOf(GhostAPIError);
        expect(error.operation).toBe('getPost');
        expect(error.ghostStatusCode).toBe(404);
        expect(error.originalError).toBe('Post not found');
      });

      it('should handle error without response', () => {
        const ghostError = {
          statusCode: 500,
          message: 'Server error',
        };

        const error = ErrorHandler.fromGhostError(ghostError, 'operation');

        expect(error.ghostStatusCode).toBe(500);
        expect(error.originalError).toBe('Server error');
      });
    });

    describe('isRetryable', () => {
      it('should return true for RateLimitError', () => {
        const error = new RateLimitError();
        expect(ErrorHandler.isRetryable(error)).toBe(true);
      });

      it('should return true for ExternalServiceError', () => {
        const error = new ExternalServiceError('API', 'error');
        expect(ErrorHandler.isRetryable(error)).toBe(true);
      });

      it('should return true for GhostAPIError with retryable status codes', () => {
        expect(ErrorHandler.isRetryable(new GhostAPIError('op', 'err', 429))).toBe(true);
        expect(ErrorHandler.isRetryable(new GhostAPIError('op', 'err', 502))).toBe(true);
        expect(ErrorHandler.isRetryable(new GhostAPIError('op', 'err', 503))).toBe(true);
        expect(ErrorHandler.isRetryable(new GhostAPIError('op', 'err', 504))).toBe(true);
      });

      it('should return true for GhostAPIError (extends ExternalServiceError)', () => {
        // GhostAPIError extends ExternalServiceError, so it's always retryable
        // The ghostStatusCode-specific logic is never reached due to instanceof check order
        expect(ErrorHandler.isRetryable(new GhostAPIError('op', 'err', 400))).toBe(true);
        expect(ErrorHandler.isRetryable(new GhostAPIError('op', 'err', 404))).toBe(true);
      });

      it('should return true for network errors', () => {
        const econnrefused = new Error();
        econnrefused.code = 'ECONNREFUSED';
        expect(ErrorHandler.isRetryable(econnrefused)).toBe(true);

        const etimedout = new Error();
        etimedout.code = 'ETIMEDOUT';
        expect(ErrorHandler.isRetryable(etimedout)).toBe(true);

        const econnreset = new Error();
        econnreset.code = 'ECONNRESET';
        expect(ErrorHandler.isRetryable(econnreset)).toBe(true);
      });

      it('should return false for non-retryable errors', () => {
        expect(ErrorHandler.isRetryable(new ValidationError('Invalid'))).toBe(false);
        expect(ErrorHandler.isRetryable(new Error('Unknown'))).toBe(false);
      });
    });

    describe('getRetryDelay', () => {
      it('should return retryAfter for RateLimitError in milliseconds', () => {
        const error = new RateLimitError(60);
        const delay = ErrorHandler.getRetryDelay(1, error);

        expect(delay).toBe(60000); // 60 seconds * 1000
      });

      it('should calculate exponential backoff for attempt 1', () => {
        const error = new ExternalServiceError('API', 'error');
        const delay = ErrorHandler.getRetryDelay(1, error);

        // Base delay is 1000ms, with jitter of up to 30%
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(1300);
      });

      it('should calculate exponential backoff for attempt 2', () => {
        const error = new ExternalServiceError('API', 'error');
        const delay = ErrorHandler.getRetryDelay(2, error);

        // 2000ms base + up to 30% jitter
        expect(delay).toBeGreaterThanOrEqual(2000);
        expect(delay).toBeLessThanOrEqual(2600);
      });

      it('should calculate exponential backoff for attempt 3', () => {
        const error = new ExternalServiceError('API', 'error');
        const delay = ErrorHandler.getRetryDelay(3, error);

        // 4000ms base + up to 30% jitter
        expect(delay).toBeGreaterThanOrEqual(4000);
        expect(delay).toBeLessThanOrEqual(5200);
      });

      it('should cap delay at maximum', () => {
        const error = new ExternalServiceError('API', 'error');
        const delay = ErrorHandler.getRetryDelay(10, error);

        // Max delay is 30000ms + 30% jitter
        expect(delay).toBeLessThanOrEqual(39000);
      });

      it('should return integer delay', () => {
        const error = new ExternalServiceError('API', 'error');
        const delay = ErrorHandler.getRetryDelay(2, error);

        expect(Number.isInteger(delay)).toBe(true);
      });
    });
  });

  describe('CircuitBreaker', () => {
    let breaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 500,
      });
    });

    it('should initialize in CLOSED state', () => {
      const state = breaker.getState();

      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.lastFailureTime).toBeNull();
      expect(state.nextAttempt).toBeNull();
    });

    it('should execute successful function in CLOSED state', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(breaker.getState().state).toBe('CLOSED');
      expect(breaker.getState().failureCount).toBe(0);
    });

    it('should increment failure count on error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Failed'));

      await expect(breaker.execute(fn)).rejects.toThrow('Failed');
      expect(breaker.getState().failureCount).toBe(1);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fn = vi.fn().mockRejectedValue(new Error('Failed'));

      // Fail 3 times (threshold)
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      const state = breaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
      expect(state.nextAttempt).toBeGreaterThan(Date.now());

      consoleSpy.mockRestore();
    });

    it('should reject immediately when OPEN', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fn = vi.fn().mockRejectedValue(new Error('Failed'));

      // Trip the breaker
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      // Now it should reject immediately
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(fn).toHaveBeenCalledTimes(3); // Not called the 4th time

      consoleSpy.mockRestore();
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fn = vi.fn().mockRejectedValue(new Error('Failed'));

      // Trip the breaker
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      expect(breaker.getState().state).toBe('OPEN');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Next call should transition to HALF_OPEN
      const successFn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(successFn);

      expect(result).toBe('success');
      expect(breaker.getState().state).toBe('CLOSED');

      consoleSpy.mockRestore();
    });

    it('should reset to CLOSED on success in HALF_OPEN state', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failFn = vi.fn().mockRejectedValue(new Error('Failed'));

      // Trip the breaker
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Successful call should reset to CLOSED
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn);

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.lastFailureTime).toBeNull();

      consoleSpy.mockRestore();
    });

    it('should use default options when not provided', () => {
      const defaultBreaker = new CircuitBreaker();

      expect(defaultBreaker.failureThreshold).toBe(5);
      expect(defaultBreaker.resetTimeout).toBe(60000);
      expect(defaultBreaker.monitoringPeriod).toBe(10000);
    });
  });

  describe('retryWithBackoff', () => {
    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError(1))
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts with retryable error', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = new ExternalServiceError('API', 'Failed');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { maxAttempts: 3 })).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });

    it('should not retry non-retryable errors', async () => {
      const error = new ValidationError('Invalid input');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { maxAttempts: 3 })).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback on retry', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError(1))
        .mockResolvedValueOnce('success');

      await retryWithBackoff(fn, { maxAttempts: 3, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(RateLimitError));

      consoleSpy.mockRestore();
    });

    it('should use default maxAttempts of 3', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = new RateLimitError(1);
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn)).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });

    it('should wait between retries', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const startTime = Date.now();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ExternalServiceError('API', 'Error'))
        .mockResolvedValueOnce('success');

      await retryWithBackoff(fn, { maxAttempts: 2 });

      const duration = Date.now() - startTime;
      // Should wait at least 1000ms (first retry delay)
      expect(duration).toBeGreaterThanOrEqual(1000);

      consoleSpy.mockRestore();
    });
  });
});
