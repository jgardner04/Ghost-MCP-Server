import dotenv from 'dotenv';

dotenv.config();

/**
 * MCP Server Configuration
 * 
 * Transport Options:
 * - 'stdio': Best for CLI tools and direct process communication
 * - 'http'/'sse': Good for web clients, supports CORS
 * - 'websocket': Best for real-time bidirectional communication
 */
export const mcpConfig = {
  // Transport configuration
  transport: {
    type: process.env.MCP_TRANSPORT || 'http', // 'stdio', 'http', 'sse', 'websocket'
    port: parseInt(process.env.MCP_PORT || '3001'),
    
    // HTTP/SSE specific options
    cors: process.env.MCP_CORS || '*',
    sseEndpoint: process.env.MCP_SSE_ENDPOINT || '/mcp/sse',
    
    // WebSocket specific options
    wsPath: process.env.MCP_WS_PATH || '/',
    wsHeartbeatInterval: parseInt(process.env.MCP_WS_HEARTBEAT || '30000'),
  },
  
  // Server metadata
  metadata: {
    name: process.env.MCP_SERVER_NAME || 'Ghost CMS Manager',
    description: process.env.MCP_SERVER_DESC || 'MCP Server to manage a Ghost CMS instance using the Admin API.',
    version: process.env.MCP_SERVER_VERSION || '1.0.0',
  },
  
  // Error handling
  errorHandling: {
    includeStackTrace: process.env.NODE_ENV === 'development',
    maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.MCP_RETRY_DELAY || '1000'),
  },
  
  // Logging
  logging: {
    level: process.env.MCP_LOG_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
    format: process.env.MCP_LOG_FORMAT || 'json', // 'json', 'text'
  },
  
  // Security
  security: {
    // Add API key authentication if needed
    apiKey: process.env.MCP_API_KEY,
    allowedOrigins: process.env.MCP_ALLOWED_ORIGINS?.split(',') || ['*'],
  }
};

/**
 * Get transport-specific configuration
 */
export function getTransportConfig() {
  const { transport } = mcpConfig;
  
  switch (transport.type) {
    case 'stdio':
      return {
        type: 'stdio',
        // No additional config needed for stdio
      };
      
    case 'http':
    case 'sse':
      return {
        type: 'sse',
        port: transport.port,
        cors: transport.cors,
        endpoint: transport.sseEndpoint,
      };
      
    case 'websocket':
      return {
        type: 'websocket',
        port: transport.port,
        path: transport.wsPath,
        heartbeatInterval: transport.wsHeartbeatInterval,
      };
      
    default:
      throw new Error(`Unknown transport type: ${transport.type}`);
  }
}

/**
 * Validate configuration
 */
export function validateConfig() {
  const errors = [];
  
  // Check if transport configuration exists
  if (!mcpConfig.transport) {
    errors.push('Missing transport configuration');
  } else {
    // Check transport type
    const validTransports = ['stdio', 'http', 'sse', 'websocket'];
    if (!mcpConfig.transport.type || !validTransports.includes(mcpConfig.transport.type)) {
      errors.push(`Invalid transport type: ${mcpConfig.transport.type}`);
    }
    
    // Check port for network transports
    if (mcpConfig.transport.type && ['http', 'sse', 'websocket'].includes(mcpConfig.transport.type)) {
      if (!mcpConfig.transport.port || mcpConfig.transport.port < 1 || mcpConfig.transport.port > 65535) {
        errors.push(`Invalid port: ${mcpConfig.transport.port}`);
      }
    }
  }
  
  // Check Ghost configuration
  if (!process.env.GHOST_ADMIN_API_URL) {
    errors.push('Missing GHOST_ADMIN_API_URL environment variable');
  }
  
  if (!process.env.GHOST_ADMIN_API_KEY) {
    errors.push('Missing GHOST_ADMIN_API_KEY environment variable');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
  
  return true;
}

export default mcpConfig;