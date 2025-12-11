import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dotenv before importing config
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

describe('mcp-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    // Reset environment variables to a clean state
    process.env = {
      ...originalEnv,
      GHOST_ADMIN_API_URL: 'https://ghost.example.com',
      GHOST_ADMIN_API_KEY: 'test-api-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('mcpConfig object', () => {
    describe('transport configuration', () => {
      it('should use default transport type "http" when not specified', async () => {
        delete process.env.MCP_TRANSPORT;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.type).toBe('http');
      });

      it('should use MCP_TRANSPORT env var when specified', async () => {
        process.env.MCP_TRANSPORT = 'websocket';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.type).toBe('websocket');
      });

      it('should use default port 3001 when not specified', async () => {
        delete process.env.MCP_PORT;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.port).toBe(3001);
      });

      it('should use MCP_PORT env var when specified', async () => {
        process.env.MCP_PORT = '4000';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.port).toBe(4000);
      });

      it('should use default CORS "*" when not specified', async () => {
        delete process.env.MCP_CORS;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.cors).toBe('*');
      });

      it('should use MCP_CORS env var when specified', async () => {
        process.env.MCP_CORS = 'https://example.com';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.cors).toBe('https://example.com');
      });

      it('should use default SSE endpoint when not specified', async () => {
        delete process.env.MCP_SSE_ENDPOINT;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.sseEndpoint).toBe('/mcp/sse');
      });

      it('should use default WebSocket path when not specified', async () => {
        delete process.env.MCP_WS_PATH;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.wsPath).toBe('/');
      });

      it('should use default heartbeat interval when not specified', async () => {
        delete process.env.MCP_WS_HEARTBEAT;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.transport.wsHeartbeatInterval).toBe(30000);
      });
    });

    describe('metadata configuration', () => {
      it('should use default server name when not specified', async () => {
        delete process.env.MCP_SERVER_NAME;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.metadata.name).toBe('Ghost CMS Manager');
      });

      it('should use MCP_SERVER_NAME env var when specified', async () => {
        process.env.MCP_SERVER_NAME = 'My Ghost Server';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.metadata.name).toBe('My Ghost Server');
      });

      it('should use default description when not specified', async () => {
        delete process.env.MCP_SERVER_DESC;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.metadata.description).toContain('MCP Server to manage a Ghost CMS');
      });

      it('should use default version when not specified', async () => {
        delete process.env.MCP_SERVER_VERSION;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.metadata.version).toBe('1.0.0');
      });
    });

    describe('errorHandling configuration', () => {
      it('should not include stack trace in production', async () => {
        process.env.NODE_ENV = 'production';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.errorHandling.includeStackTrace).toBe(false);
      });

      it('should include stack trace in development', async () => {
        process.env.NODE_ENV = 'development';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.errorHandling.includeStackTrace).toBe(true);
      });

      it('should use default max retries when not specified', async () => {
        delete process.env.MCP_MAX_RETRIES;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.errorHandling.maxRetries).toBe(3);
      });

      it('should use default retry delay when not specified', async () => {
        delete process.env.MCP_RETRY_DELAY;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.errorHandling.retryDelay).toBe(1000);
      });
    });

    describe('logging configuration', () => {
      it('should use default log level when not specified', async () => {
        delete process.env.MCP_LOG_LEVEL;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.logging.level).toBe('info');
      });

      it('should use MCP_LOG_LEVEL env var when specified', async () => {
        process.env.MCP_LOG_LEVEL = 'debug';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.logging.level).toBe('debug');
      });

      it('should use default log format when not specified', async () => {
        delete process.env.MCP_LOG_FORMAT;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.logging.format).toBe('json');
      });
    });

    describe('security configuration', () => {
      it('should include API key when specified', async () => {
        process.env.MCP_API_KEY = 'secret-key';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.security.apiKey).toBe('secret-key');
      });

      it('should have undefined API key when not specified', async () => {
        delete process.env.MCP_API_KEY;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.security.apiKey).toBeUndefined();
      });

      it('should use default allowed origins when not specified', async () => {
        delete process.env.MCP_ALLOWED_ORIGINS;
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.security.allowedOrigins).toEqual(['*']);
      });

      it('should parse comma-separated allowed origins', async () => {
        process.env.MCP_ALLOWED_ORIGINS = 'https://a.com,https://b.com';
        const { mcpConfig } = await import('../mcp-config.js');
        expect(mcpConfig.security.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
      });
    });
  });

  describe('getTransportConfig', () => {
    it('should return stdio config for stdio transport', async () => {
      process.env.MCP_TRANSPORT = 'stdio';
      const { getTransportConfig } = await import('../mcp-config.js');
      const config = getTransportConfig();
      expect(config).toEqual({ type: 'stdio' });
    });

    it('should return SSE config for http transport', async () => {
      process.env.MCP_TRANSPORT = 'http';
      process.env.MCP_PORT = '3001';
      const { getTransportConfig } = await import('../mcp-config.js');
      const config = getTransportConfig();
      expect(config.type).toBe('sse');
      expect(config.port).toBe(3001);
      expect(config.cors).toBeDefined();
      expect(config.endpoint).toBeDefined();
    });

    it('should return SSE config for sse transport', async () => {
      process.env.MCP_TRANSPORT = 'sse';
      const { getTransportConfig } = await import('../mcp-config.js');
      const config = getTransportConfig();
      expect(config.type).toBe('sse');
    });

    it('should return websocket config for websocket transport', async () => {
      process.env.MCP_TRANSPORT = 'websocket';
      process.env.MCP_PORT = '3002';
      process.env.MCP_WS_PATH = '/ws';
      process.env.MCP_WS_HEARTBEAT = '15000';
      const { getTransportConfig } = await import('../mcp-config.js');
      const config = getTransportConfig();
      expect(config).toEqual({
        type: 'websocket',
        port: 3002,
        path: '/ws',
        heartbeatInterval: 15000,
      });
    });

    it('should throw error for unknown transport type', async () => {
      process.env.MCP_TRANSPORT = 'invalid-transport';
      const { getTransportConfig } = await import('../mcp-config.js');
      expect(() => getTransportConfig()).toThrow('Unknown transport type: invalid-transport');
    });
  });

  describe('validateConfig', () => {
    it('should return true when configuration is valid', async () => {
      process.env.GHOST_ADMIN_API_URL = 'https://ghost.example.com';
      process.env.GHOST_ADMIN_API_KEY = 'test-api-key';
      process.env.MCP_TRANSPORT = 'http';
      process.env.MCP_PORT = '3001';
      const { validateConfig } = await import('../mcp-config.js');
      expect(validateConfig()).toBe(true);
    });

    it('should throw error when GHOST_ADMIN_API_URL is missing', async () => {
      delete process.env.GHOST_ADMIN_API_URL;
      process.env.GHOST_ADMIN_API_KEY = 'test-api-key';
      const { validateConfig } = await import('../mcp-config.js');
      expect(() => validateConfig()).toThrow('Missing GHOST_ADMIN_API_URL');
    });

    it('should throw error when GHOST_ADMIN_API_KEY is missing', async () => {
      process.env.GHOST_ADMIN_API_URL = 'https://ghost.example.com';
      delete process.env.GHOST_ADMIN_API_KEY;
      const { validateConfig } = await import('../mcp-config.js');
      expect(() => validateConfig()).toThrow('Missing GHOST_ADMIN_API_KEY');
    });

    it('should throw error for invalid transport type', async () => {
      process.env.MCP_TRANSPORT = 'invalid';
      const { validateConfig } = await import('../mcp-config.js');
      expect(() => validateConfig()).toThrow('Invalid transport type');
    });

    it('should throw error for invalid port (0)', async () => {
      process.env.MCP_TRANSPORT = 'http';
      process.env.MCP_PORT = '0';
      const { validateConfig } = await import('../mcp-config.js');
      expect(() => validateConfig()).toThrow('Invalid port');
    });

    it('should throw error for invalid port (negative)', async () => {
      process.env.MCP_TRANSPORT = 'http';
      process.env.MCP_PORT = '-1';
      const { validateConfig } = await import('../mcp-config.js');
      expect(() => validateConfig()).toThrow('Invalid port');
    });

    it('should throw error for invalid port (> 65535)', async () => {
      process.env.MCP_TRANSPORT = 'http';
      process.env.MCP_PORT = '70000';
      const { validateConfig } = await import('../mcp-config.js');
      expect(() => validateConfig()).toThrow('Invalid port');
    });

    it('should not validate port for stdio transport', async () => {
      process.env.MCP_TRANSPORT = 'stdio';
      process.env.MCP_PORT = '0'; // Invalid port, but not checked for stdio
      const { validateConfig } = await import('../mcp-config.js');
      expect(validateConfig()).toBe(true);
    });

    it('should accumulate multiple errors', async () => {
      delete process.env.GHOST_ADMIN_API_URL;
      delete process.env.GHOST_ADMIN_API_KEY;
      process.env.MCP_TRANSPORT = 'invalid';
      const { validateConfig } = await import('../mcp-config.js');
      try {
        validateConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Invalid transport type');
        expect(error.message).toContain('GHOST_ADMIN_API_URL');
        expect(error.message).toContain('GHOST_ADMIN_API_KEY');
      }
    });
  });

  describe('default export', () => {
    it('should export mcpConfig as default', async () => {
      const module = await import('../mcp-config.js');
      expect(module.default).toBeDefined();
      expect(module.default).toHaveProperty('transport');
      expect(module.default).toHaveProperty('metadata');
    });
  });
});
