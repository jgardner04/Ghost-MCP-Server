/**
 * Enhanced MCP Server with Advanced Resource Management
 */

import { MCPServer, Tool } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { WebSocketServerTransport } from '@modelcontextprotocol/sdk/server/websocket.js';
import dotenv from 'dotenv';
import express from 'express';
import { WebSocketServer } from 'ws';

// Import services
import ghostService from './services/ghostServiceImproved.js';
import { ResourceManager } from './resources/ResourceManager.js';
import { ErrorHandler, ValidationError } from './errors/index.js';
import {
  errorLogger,
  mcpCors,
  RateLimiter,
  healthCheck,
  GracefulShutdown,
} from './middleware/errorMiddleware.js';

dotenv.config();

console.log('Initializing Enhanced MCP Server...');

// Initialize components
const resourceManager = new ResourceManager(ghostService);
const rateLimiter = new RateLimiter();
const gracefulShutdown = new GracefulShutdown();

// Create MCP Server
const mcpServer = new MCPServer({
  metadata: {
    name: 'Ghost CMS Manager',
    description: 'Enhanced MCP Server for Ghost CMS with advanced resource management',
    version: '2.0.0',
    capabilities: {
      resources: true,
      tools: true,
      subscriptions: true,
      batch: true,
    },
  },
});

// --- Register Resources with Enhanced Fetching ---

console.log('Registering enhanced resources...');

// Ghost Post Resource
const postResource = resourceManager.registerResource(
  'ghost/post',
  {
    type: 'object',
    properties: {
      id: { type: 'string' },
      uuid: { type: 'string' },
      title: { type: 'string' },
      slug: { type: 'string' },
      html: { type: ['string', 'null'] },
      status: {
        type: 'string',
        enum: ['draft', 'published', 'scheduled'],
      },
      feature_image: { type: ['string', 'null'] },
      published_at: {
        type: ['string', 'null'],
        format: 'date-time',
      },
      tags: {
        type: 'array',
        items: { $ref: 'ghost/tag#/schema' },
      },
      meta_title: { type: ['string', 'null'] },
      meta_description: { type: ['string', 'null'] },
    },
    required: ['id', 'uuid', 'title', 'slug', 'status'],
  },
  {
    description: 'Ghost blog post with support for multiple identifier types',
    examples: [
      'ghost/post/123',
      'ghost/post/slug:my-awesome-post',
      'ghost/post/uuid:550e8400-e29b-41d4-a716-446655440000',
      'ghost/posts?status=published&limit=10&page=1',
    ],
  }
);

mcpServer.addResource(postResource);

// Ghost Tag Resource
const tagResource = resourceManager.registerResource(
  'ghost/tag',
  {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      slug: { type: 'string' },
      description: { type: ['string', 'null'] },
      feature_image: { type: ['string', 'null'] },
      visibility: {
        type: 'string',
        enum: ['public', 'internal'],
      },
      meta_title: { type: ['string', 'null'] },
      meta_description: { type: ['string', 'null'] },
    },
    required: ['id', 'name', 'slug'],
  },
  {
    description: 'Ghost tag for categorizing posts',
    examples: [
      'ghost/tag/technology',
      'ghost/tag/slug:web-development',
      'ghost/tag/name:JavaScript',
      'ghost/tags?limit=20',
    ],
  }
);

mcpServer.addResource(tagResource);

// --- Enhanced Tools ---

console.log('Registering enhanced tools...');

// Batch Operations Tool
const batchOperationsTool = new Tool({
  name: 'ghost_batch_operations',
  description: 'Execute multiple Ghost operations in a single request',
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Operation ID for reference' },
            type: {
              type: 'string',
              enum: ['create_post', 'update_post', 'create_tag', 'fetch_resource'],
            },
            data: { type: 'object', description: 'Operation-specific data' },
          },
          required: ['id', 'type', 'data'],
        },
        minItems: 1,
        maxItems: 10,
      },
      stopOnError: {
        type: 'boolean',
        default: false,
        description: 'Stop processing on first error',
      },
    },
    required: ['operations'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: { type: 'object' },
          },
        },
      },
    },
  },
  implementation: async (input) => {
    const results = {};

    for (const operation of input.operations) {
      try {
        let result;

        switch (operation.type) {
          case 'create_post':
            result = await ghostService.createPost(operation.data);
            break;
          case 'update_post':
            result = await ghostService.updatePost(operation.data.id, operation.data);
            break;
          case 'create_tag':
            result = await ghostService.createTag(operation.data);
            break;
          case 'fetch_resource':
            result = await resourceManager.fetchResource(operation.data.uri);
            break;
          default:
            throw new ValidationError(`Unknown operation type: ${operation.type}`);
        }

        results[operation.id] = {
          success: true,
          data: result,
        };
      } catch (error) {
        results[operation.id] = {
          success: false,
          error: ErrorHandler.formatMCPError(error),
        };

        if (input.stopOnError) {
          break;
        }
      }
    }

    return { results };
  },
});

mcpServer.addTool(batchOperationsTool);

// Resource Search Tool
const searchResourcesTool = new Tool({
  name: 'ghost_search_resources',
  description: 'Search for Ghost resources with advanced filtering',
  inputSchema: {
    type: 'object',
    properties: {
      resourceType: {
        type: 'string',
        enum: ['posts', 'tags'],
        description: 'Type of resource to search',
      },
      query: {
        type: 'string',
        description: 'Search query',
      },
      filters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          visibility: { type: 'string' },
          tag: { type: 'string' },
          author: { type: 'string' },
          published_after: { type: 'string', format: 'date-time' },
          published_before: { type: 'string', format: 'date-time' },
        },
      },
      sort: {
        type: 'string',
        default: 'published_at desc',
        description: 'Sort order',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 15,
      },
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
      },
    },
    required: ['resourceType'],
  },
  implementation: async (input) => {
    const { resourceType, query, filters = {}, sort, limit, page } = input;

    // Build Ghost filter string
    let filterParts = [];

    if (query) {
      filterParts.push(`title:~'${query}'`);
    }

    if (filters.status) {
      filterParts.push(`status:${filters.status}`);
    }

    if (filters.visibility) {
      filterParts.push(`visibility:${filters.visibility}`);
    }

    if (filters.tag) {
      filterParts.push(`tag:${filters.tag}`);
    }

    if (filters.author) {
      filterParts.push(`author:${filters.author}`);
    }

    if (filters.published_after) {
      filterParts.push(`published_at:>='${filters.published_after}'`);
    }

    if (filters.published_before) {
      filterParts.push(`published_at:<='${filters.published_before}'`);
    }

    const ghostFilter = filterParts.join('+');

    // Build resource URI
    const uri = `ghost/${resourceType}?${new URLSearchParams({
      filter: ghostFilter,
      order: sort,
      limit,
      page,
    }).toString()}`;

    // Fetch using ResourceManager
    return await resourceManager.fetchResource(uri);
  },
});

mcpServer.addTool(searchResourcesTool);

// Cache Management Tool
const cacheManagementTool = new Tool({
  name: 'ghost_cache_management',
  description: 'Manage resource cache',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['invalidate', 'stats', 'prefetch'],
        description: 'Cache action to perform',
      },
      pattern: {
        type: 'string',
        description: 'Pattern for invalidation (optional)',
      },
      uris: {
        type: 'array',
        items: { type: 'string' },
        description: 'URIs to prefetch (for prefetch action)',
      },
    },
    required: ['action'],
  },
  implementation: async (input) => {
    switch (input.action) {
      case 'invalidate':
        resourceManager.invalidateCache(input.pattern);
        return {
          success: true,
          message: `Cache invalidated${input.pattern ? ` for pattern: ${input.pattern}` : ''}`,
        };

      case 'stats':
        return resourceManager.getCacheStats();

      case 'prefetch':
        if (!input.uris || input.uris.length === 0) {
          throw new ValidationError('URIs required for prefetch action');
        }
        return await resourceManager.prefetch(input.uris);

      default:
        throw new ValidationError(`Unknown action: ${input.action}`);
    }
  },
});

mcpServer.addTool(cacheManagementTool);

// Resource Subscription Tool
const subscriptionTool = new Tool({
  name: 'ghost_subscribe',
  description: 'Subscribe to resource changes',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['subscribe', 'unsubscribe'],
        description: 'Subscription action',
      },
      uri: {
        type: 'string',
        description: 'Resource URI to subscribe to (required for subscribe action)',
      },
      subscriptionId: {
        type: 'string',
        description: 'Subscription ID (required for unsubscribe action)',
      },
      options: {
        type: 'object',
        properties: {
          pollingInterval: {
            type: 'integer',
            minimum: 5000,
            default: 30000,
            description: 'Polling interval in milliseconds',
          },
          enablePolling: {
            type: 'boolean',
            default: false,
            description: 'Enable automatic polling',
          },
        },
      },
    },
    required: ['action'],
    // Add conditional validation using JSON Schema if/then/else
    if: {
      properties: { action: { const: 'subscribe' } },
    },
    then: {
      required: ['uri'],
    },
    else: {
      if: {
        properties: { action: { const: 'unsubscribe' } },
      },
      then: {
        required: ['subscriptionId'],
      },
    },
  },
  implementation: async (input) => {
    if (input.action === 'subscribe') {
      if (!input.uri) {
        throw new ValidationError('URI required for subscribe action');
      }

      const subscriptionId = resourceManager.subscribe(
        input.uri,
        (event) => {
          // In a real implementation, this would send events to the client
          console.log('Resource update:', event);
        },
        input.options || {}
      );

      return {
        success: true,
        subscriptionId,
        message: `Subscribed to ${input.uri}`,
      };
    } else if (input.action === 'unsubscribe') {
      if (!input.subscriptionId) {
        throw new ValidationError('Subscription ID required for unsubscribe action');
      }

      resourceManager.unsubscribe(input.subscriptionId);

      return {
        success: true,
        message: `Unsubscribed from ${input.subscriptionId}`,
      };
    }
  },
});

mcpServer.addTool(subscriptionTool);

// Keep existing tools (create_post, upload_image, etc.) from previous implementation
// ... (include the tools from mcp_server_improved.js)

// --- Enhanced Transport with Middleware ---

const startEnhancedMCPServer = async (transport = 'http', options = {}) => {
  try {
    console.log(`Starting Enhanced MCP Server with ${transport} transport...`);

    switch (transport) {
      case 'stdio':
        const stdioTransport = new StdioServerTransport();
        await mcpServer.connect(stdioTransport);
        console.log('Enhanced MCP Server running on stdio transport');
        break;

      case 'http':
      case 'sse':
        const port = options.port || 3001;
        const app = express();

        // Apply middleware
        app.use(gracefulShutdown.middleware());
        app.use(rateLimiter.middleware());
        app.use(mcpCors(options.allowedOrigins));

        // Health check with Ghost status
        app.get('/health', healthCheck(ghostService));

        // Resource endpoints
        app.get('/resources', async (req, res) => {
          try {
            const resources = resourceManager.listResources(req.query);
            res.json(resources);
          } catch (error) {
            const formatted = ErrorHandler.formatHTTPError(error);
            res.status(formatted.statusCode).json(formatted.body);
          }
        });

        app.get('/resources/*', async (req, res) => {
          try {
            const uri = req.params[0];

            // Validate and sanitize the URI to prevent path traversal
            if (!uri || typeof uri !== 'string') {
              throw new ValidationError('Invalid resource URI');
            }

            // Ensure the URI doesn't contain path traversal attempts
            if (uri.includes('..') || uri.includes('//') || uri.includes('\\')) {
              throw new ValidationError('Invalid resource URI: path traversal detected');
            }

            // Only allow specific URI patterns for Ghost resources
            const validPatterns = /^ghost\/(post|posts|tag|tags|author|authors|page|pages)/;
            if (!validPatterns.test(uri)) {
              throw new ValidationError('Invalid resource type');
            }

            const result = await resourceManager.fetchResource(uri);
            res.json(result);
          } catch (error) {
            const formatted = ErrorHandler.formatHTTPError(error);
            res.status(formatted.statusCode).json(formatted.body);
          }
        });

        // Batch endpoint
        app.post('/batch', async (req, res) => {
          try {
            const result = await resourceManager.batchFetch(req.body.uris);
            res.json(result);
          } catch (error) {
            const formatted = ErrorHandler.formatHTTPError(error);
            res.status(formatted.statusCode).json(formatted.body);
          }
        });

        // Cache stats endpoint
        app.get('/cache/stats', (req, res) => {
          res.json(resourceManager.getCacheStats());
        });

        // SSE endpoint for MCP
        const sseTransport = new SSEServerTransport();
        app.get('/mcp/sse', sseTransport.handler());

        await mcpServer.connect(sseTransport);

        const server = app.listen(port, () => {
          console.log(`Enhanced MCP Server (SSE) listening on port ${port}`);
          console.log(`Health: http://localhost:${port}/health`);
          console.log(`Resources: http://localhost:${port}/resources`);
          console.log(`SSE: http://localhost:${port}/mcp/sse`);
        });

        mcpServer._httpServer = server;

        // Track connections for graceful shutdown
        server.on('connection', (connection) => {
          gracefulShutdown.trackConnection(connection);
        });

        break;

      case 'websocket':
        const wsPort = options.port || 3001;
        const wss = new WebSocketServer({ port: wsPort });

        wss.on('connection', async (ws) => {
          console.log('New WebSocket connection');

          const wsTransport = new WebSocketServerTransport(ws);
          await mcpServer.connect(wsTransport);

          // Handle subscriptions over WebSocket
          ws.on('message', async (data) => {
            try {
              const message = JSON.parse(data);

              if (message.type === 'subscribe') {
                const subscriptionId = resourceManager.subscribe(
                  message.uri,
                  (event) => {
                    ws.send(
                      JSON.stringify({
                        type: 'subscription_update',
                        ...event,
                      })
                    );
                  },
                  message.options || {}
                );

                ws.send(
                  JSON.stringify({
                    type: 'subscription_created',
                    subscriptionId,
                  })
                );
              }
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  error: error.message,
                })
              );
            }
          });
        });

        console.log(`Enhanced MCP Server (WebSocket) listening on port ${wsPort}`);
        mcpServer._wss = wss;
        break;

      default:
        throw new Error(`Unknown transport type: ${transport}`);
    }

    // Log capabilities
    console.log('Server Capabilities:');
    console.log(
      '- Resources:',
      mcpServer.listResources().map((r) => r.name)
    );
    console.log(
      '- Tools:',
      mcpServer.listTools().map((t) => t.name)
    );
    console.log('- Cache enabled with LRU eviction');
    console.log('- Subscription support for real-time updates');
    console.log('- Batch operations for efficiency');
  } catch (error) {
    errorLogger.logError(error);
    console.error('Failed to start Enhanced MCP Server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down Enhanced MCP Server...');

  // Clear all subscriptions
  resourceManager.subscriptionManager.subscriptions.clear();

  // Close servers
  if (mcpServer._httpServer) {
    await gracefulShutdown.shutdown(mcpServer._httpServer);
  }

  if (mcpServer._wss) {
    mcpServer._wss.close();
  }

  await mcpServer.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Export
export { mcpServer, startEnhancedMCPServer, resourceManager };

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const transport = process.env.MCP_TRANSPORT || 'http';
  const port = parseInt(process.env.MCP_PORT || '3001');
  const allowedOrigins = process.env.MCP_ALLOWED_ORIGINS?.split(',') || ['*'];

  startEnhancedMCPServer(transport, { port, allowedOrigins });
}
