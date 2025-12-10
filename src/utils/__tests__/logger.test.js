import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContextLogger } from '../logger.js';
import logger from '../logger.js';

describe('logger', () => {
  describe('default logger export', () => {
    it('should export a winston logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have core logging methods', () => {
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('log');
    });
  });

  describe('createContextLogger', () => {
    let contextLogger;
    let logSpy;

    beforeEach(() => {
      // Spy on the underlying logger methods
      logSpy = {
        debug: vi.spyOn(logger, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(logger, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(logger, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(logger, 'error').mockImplementation(() => {}),
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('return value structure', () => {
      it('should return an object with expected methods', () => {
        contextLogger = createContextLogger('test-context');

        expect(contextLogger).toBeDefined();
        expect(typeof contextLogger).toBe('object');
      });

      it('should have basic logging methods', () => {
        contextLogger = createContextLogger('test-context');

        expect(typeof contextLogger.info).toBe('function');
        expect(typeof contextLogger.warn).toBe('function');
        expect(typeof contextLogger.error).toBe('function');
        expect(typeof contextLogger.debug).toBe('function');
      });

      it('should have API-specific methods', () => {
        contextLogger = createContextLogger('test-context');

        expect(typeof contextLogger.apiRequest).toBe('function');
        expect(typeof contextLogger.apiResponse).toBe('function');
        expect(typeof contextLogger.apiError).toBe('function');
      });

      it('should have tool-specific methods', () => {
        contextLogger = createContextLogger('test-context');

        expect(typeof contextLogger.toolExecution).toBe('function');
        expect(typeof contextLogger.toolSuccess).toBe('function');
        expect(typeof contextLogger.toolError).toBe('function');
      });

      it('should have file operation method', () => {
        contextLogger = createContextLogger('test-context');

        expect(typeof contextLogger.fileOperation).toBe('function');
      });
    });

    describe('basic logging methods', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('test-service');
      });

      it('should call logger.debug with context', () => {
        contextLogger.debug('debug message');

        expect(logSpy.debug).toHaveBeenCalledWith('debug message', {
          context: 'test-service',
        });
      });

      it('should call logger.info with context', () => {
        contextLogger.info('info message');

        expect(logSpy.info).toHaveBeenCalledWith('info message', {
          context: 'test-service',
        });
      });

      it('should call logger.warn with context', () => {
        contextLogger.warn('warning message');

        expect(logSpy.warn).toHaveBeenCalledWith('warning message', {
          context: 'test-service',
        });
      });

      it('should call logger.error with context', () => {
        contextLogger.error('error message');

        expect(logSpy.error).toHaveBeenCalledWith('error message', {
          context: 'test-service',
        });
      });

      it('should merge additional metadata with context', () => {
        contextLogger.info('info message', { userId: '123', action: 'login' });

        expect(logSpy.info).toHaveBeenCalledWith('info message', {
          context: 'test-service',
          userId: '123',
          action: 'login',
        });
      });

      it('should handle empty metadata object', () => {
        contextLogger.info('info message', {});

        expect(logSpy.info).toHaveBeenCalledWith('info message', {
          context: 'test-service',
        });
      });

      it('should work with different context values', () => {
        const logger1 = createContextLogger('service-a');
        const logger2 = createContextLogger('service-b');

        logger1.info('message from A');
        logger2.info('message from B');

        expect(logSpy.info).toHaveBeenCalledWith('message from A', {
          context: 'service-a',
        });
        expect(logSpy.info).toHaveBeenCalledWith('message from B', {
          context: 'service-b',
        });
      });
    });

    describe('apiRequest method', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('api-handler');
      });

      it('should log API request with method and URL', () => {
        contextLogger.apiRequest('GET', '/api/posts');

        expect(logSpy.info).toHaveBeenCalledWith('GET /api/posts', {
          context: 'api-handler',
          type: 'api_request',
        });
      });

      it('should include additional metadata', () => {
        contextLogger.apiRequest('POST', '/api/posts', { requestId: 'req-123' });

        expect(logSpy.info).toHaveBeenCalledWith('POST /api/posts', {
          context: 'api-handler',
          type: 'api_request',
          requestId: 'req-123',
        });
      });

      it('should handle different HTTP methods', () => {
        contextLogger.apiRequest('PUT', '/api/posts/1');
        contextLogger.apiRequest('DELETE', '/api/posts/1');
        contextLogger.apiRequest('PATCH', '/api/posts/1');

        expect(logSpy.info).toHaveBeenCalledWith('PUT /api/posts/1', expect.any(Object));
        expect(logSpy.info).toHaveBeenCalledWith('DELETE /api/posts/1', expect.any(Object));
        expect(logSpy.info).toHaveBeenCalledWith('PATCH /api/posts/1', expect.any(Object));
      });
    });

    describe('apiResponse method', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('api-handler');
      });

      it('should log API response with method, URL, and status', () => {
        contextLogger.apiResponse('GET', '/api/posts', 200);

        expect(logSpy.info).toHaveBeenCalledWith('GET /api/posts -> 200', {
          context: 'api-handler',
          type: 'api_response',
        });
      });

      it('should include additional metadata', () => {
        contextLogger.apiResponse('POST', '/api/posts', 201, { duration: 150 });

        expect(logSpy.info).toHaveBeenCalledWith('POST /api/posts -> 201', {
          context: 'api-handler',
          type: 'api_response',
          duration: 150,
        });
      });

      it('should handle different status codes', () => {
        contextLogger.apiResponse('GET', '/api/posts', 404);
        contextLogger.apiResponse('POST', '/api/posts', 500);

        expect(logSpy.info).toHaveBeenCalledWith('GET /api/posts -> 404', expect.any(Object));
        expect(logSpy.info).toHaveBeenCalledWith('POST /api/posts -> 500', expect.any(Object));
      });
    });

    describe('apiError method', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('api-handler');
      });

      it('should log API error with method, URL, and error details', () => {
        const error = new Error('Connection timeout');
        error.stack = 'Error: Connection timeout\n    at test.js:1:1';

        contextLogger.apiError('GET', '/api/posts', error);

        expect(logSpy.error).toHaveBeenCalledWith('GET /api/posts failed', {
          context: 'api-handler',
          type: 'api_error',
          error: 'Connection timeout',
          stack: error.stack,
        });
      });

      it('should include additional metadata', () => {
        const error = new Error('Database error');
        error.stack = 'Error: Database error\n    at test.js:1:1';

        contextLogger.apiError('POST', '/api/posts', error, { retryCount: 3 });

        expect(logSpy.error).toHaveBeenCalledWith('POST /api/posts failed', {
          context: 'api-handler',
          type: 'api_error',
          error: 'Database error',
          stack: error.stack,
          retryCount: 3,
        });
      });

      it('should extract error message and stack from error object', () => {
        const error = new Error('Simple error');

        contextLogger.apiError('GET', '/api/posts', error);

        expect(logSpy.error).toHaveBeenCalledWith('GET /api/posts failed', {
          context: 'api-handler',
          type: 'api_error',
          error: 'Simple error',
          stack: expect.any(String),
        });
      });
    });

    describe('toolExecution method', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('mcp-server');
      });

      it('should log tool execution with tool name', () => {
        contextLogger.toolExecution('ghost_create_post', { title: 'Test' });

        expect(logSpy.info).toHaveBeenCalledWith('Executing tool: ghost_create_post', {
          context: 'mcp-server',
          type: 'tool_execution',
          tool: 'ghost_create_post',
          inputKeys: ['title'],
        });
      });

      it('should handle empty input object', () => {
        contextLogger.toolExecution('ghost_get_tags', {});

        expect(logSpy.info).toHaveBeenCalledWith('Executing tool: ghost_get_tags', {
          context: 'mcp-server',
          type: 'tool_execution',
          tool: 'ghost_get_tags',
          inputKeys: [],
        });
      });

      it('should handle null input', () => {
        contextLogger.toolExecution('ghost_get_tags', null);

        expect(logSpy.info).toHaveBeenCalledWith('Executing tool: ghost_get_tags', {
          context: 'mcp-server',
          type: 'tool_execution',
          tool: 'ghost_get_tags',
          inputKeys: [],
        });
      });

      it('should include additional metadata', () => {
        contextLogger.toolExecution(
          'ghost_upload_image',
          { url: 'https://example.com' },
          { requestId: 'req-456' }
        );

        expect(logSpy.info).toHaveBeenCalledWith('Executing tool: ghost_upload_image', {
          context: 'mcp-server',
          type: 'tool_execution',
          tool: 'ghost_upload_image',
          inputKeys: ['url'],
          requestId: 'req-456',
        });
      });
    });

    describe('toolSuccess method', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('mcp-server');
      });

      it('should log tool success with tool name and result type', () => {
        contextLogger.toolSuccess('ghost_create_post', { id: '123' });

        expect(logSpy.info).toHaveBeenCalledWith('Tool ghost_create_post completed successfully', {
          context: 'mcp-server',
          type: 'tool_success',
          tool: 'ghost_create_post',
          resultType: 'object',
        });
      });

      it('should handle different result types', () => {
        contextLogger.toolSuccess('tool1', 'string result');
        contextLogger.toolSuccess('tool2', 123);
        contextLogger.toolSuccess('tool3', true);
        contextLogger.toolSuccess('tool4', ['array']);

        expect(logSpy.info).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ resultType: 'string' })
        );
        expect(logSpy.info).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ resultType: 'number' })
        );
        expect(logSpy.info).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ resultType: 'object' })
        );
        expect(logSpy.info).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ resultType: 'object' })
        );
      });

      it('should include additional metadata', () => {
        contextLogger.toolSuccess('ghost_upload_image', { url: 'https://...' }, { duration: 250 });

        expect(logSpy.info).toHaveBeenCalledWith('Tool ghost_upload_image completed successfully', {
          context: 'mcp-server',
          type: 'tool_success',
          tool: 'ghost_upload_image',
          resultType: 'object',
          duration: 250,
        });
      });
    });

    describe('toolError method', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('mcp-server');
      });

      it('should log tool error with tool name and error details', () => {
        const error = new Error('Upload failed');
        error.stack = 'Error: Upload failed\n    at test.js:1:1';

        contextLogger.toolError('ghost_upload_image', error);

        expect(logSpy.error).toHaveBeenCalledWith('Tool ghost_upload_image failed', {
          context: 'mcp-server',
          type: 'tool_error',
          tool: 'ghost_upload_image',
          error: 'Upload failed',
          stack: error.stack,
        });
      });

      it('should include additional metadata', () => {
        const error = new Error('Validation failed');
        error.stack = 'Error: Validation failed\n    at test.js:1:1';

        contextLogger.toolError('ghost_create_post', error, {
          validationErrors: ['title required'],
        });

        expect(logSpy.error).toHaveBeenCalledWith('Tool ghost_create_post failed', {
          context: 'mcp-server',
          type: 'tool_error',
          tool: 'ghost_create_post',
          error: 'Validation failed',
          stack: error.stack,
          validationErrors: ['title required'],
        });
      });

      it('should extract error message and stack from error object', () => {
        const error = new Error('Simple error');

        contextLogger.toolError('ghost_get_tags', error);

        expect(logSpy.error).toHaveBeenCalledWith('Tool ghost_get_tags failed', {
          context: 'mcp-server',
          type: 'tool_error',
          tool: 'ghost_get_tags',
          error: 'Simple error',
          stack: expect.any(String),
        });
      });
    });

    describe('fileOperation method', () => {
      beforeEach(() => {
        contextLogger = createContextLogger('image-processor');
      });

      it('should log file operation with operation type and filename', () => {
        contextLogger.fileOperation('write', '/tmp/images/test.jpg');

        expect(logSpy.debug).toHaveBeenCalledWith('File operation: write', {
          context: 'image-processor',
          type: 'file_operation',
          operation: 'write',
          file: 'test.jpg',
        });
      });

      it('should extract basename from full path', () => {
        contextLogger.fileOperation('read', '/very/long/path/to/image.png');

        expect(logSpy.debug).toHaveBeenCalledWith('File operation: read', {
          context: 'image-processor',
          type: 'file_operation',
          operation: 'read',
          file: 'image.png',
        });
      });

      it('should handle different operation types', () => {
        contextLogger.fileOperation('delete', '/tmp/old-file.jpg');
        contextLogger.fileOperation('move', '/tmp/new-location.jpg');

        expect(logSpy.debug).toHaveBeenCalledWith('File operation: delete', expect.any(Object));
        expect(logSpy.debug).toHaveBeenCalledWith('File operation: move', expect.any(Object));
      });

      it('should include additional metadata', () => {
        contextLogger.fileOperation('optimize', '/tmp/image.jpg', { size: 1024, quality: 80 });

        expect(logSpy.debug).toHaveBeenCalledWith('File operation: optimize', {
          context: 'image-processor',
          type: 'file_operation',
          operation: 'optimize',
          file: 'image.jpg',
          size: 1024,
          quality: 80,
        });
      });
    });

    describe('context isolation', () => {
      it('should maintain separate contexts for different loggers', () => {
        const logger1 = createContextLogger('service-1');
        const logger2 = createContextLogger('service-2');

        logger1.info('message 1');
        logger2.info('message 2');

        expect(logSpy.info).toHaveBeenCalledWith('message 1', {
          context: 'service-1',
        });
        expect(logSpy.info).toHaveBeenCalledWith('message 2', {
          context: 'service-2',
        });
      });

      it('should not leak metadata between calls', () => {
        contextLogger = createContextLogger('test');

        contextLogger.info('first', { value: 1 });
        contextLogger.info('second', { value: 2 });

        expect(logSpy.info).toHaveBeenNthCalledWith(1, 'first', {
          context: 'test',
          value: 1,
        });
        expect(logSpy.info).toHaveBeenNthCalledWith(2, 'second', {
          context: 'test',
          value: 2,
        });
      });
    });
  });
});
