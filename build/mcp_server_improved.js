import { MCPServer, Resource, Tool } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { WebSocketServerTransport } from '@modelcontextprotocol/sdk/server/websocket.js';
import dotenv from 'dotenv';
import { createPostService } from './services/postService.js';
import {
  uploadImage as uploadGhostImage,
  getTags as getGhostTags,
  createTag as createGhostTag,
} from './services/ghostService.js';
import { processImage } from './services/imageProcessingService.js';
import axios from 'axios';
import { validateImageUrl, createSecureAxiosConfig } from './utils/urlValidator.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { WebSocketServer } from 'ws';

// Load environment variables
dotenv.config();

console.log('Initializing MCP Server...');

// Define the server instance
const mcpServer = new MCPServer({
  metadata: {
    name: 'Ghost CMS Manager',
    description: 'MCP Server to manage a Ghost CMS instance using the Admin API.',
    version: '1.0.0',
  },
});

// --- Error Response Standardization ---
class MCPError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const handleToolError = (error, toolName) => {
  console.error(`Error in tool ${toolName}:`, error);

  // Standardized error response
  return {
    error: {
      code: error.code || 'TOOL_EXECUTION_ERROR',
      message: error.message || 'An unexpected error occurred',
      tool: toolName,
      details: error.details || {},
      timestamp: new Date().toISOString(),
    },
  };
};

// --- Define Resources ---

console.log('Defining MCP Resources...');

// Ghost Tag Resource
const ghostTagResource = new Resource({
  name: 'ghost/tag',
  description: 'Represents a tag in Ghost CMS.',
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique ID of the tag' },
      name: { type: 'string', description: 'The name of the tag' },
      slug: { type: 'string', description: 'URL-friendly version of the name' },
      description: {
        type: ['string', 'null'],
        description: 'Optional description for the tag',
      },
    },
    required: ['id', 'name', 'slug'],
  },
  // Resource fetching handler
  async fetch(uri) {
    try {
      // Extract tag ID from URI (e.g., "ghost/tag/123")
      const tagId = uri.split('/').pop();
      const tags = await getGhostTags();
      const tag = tags.find((t) => t.id === tagId || t.slug === tagId);

      if (!tag) {
        throw new MCPError(`Tag not found: ${tagId}`, 'RESOURCE_NOT_FOUND');
      }

      return tag;
    } catch (error) {
      return handleToolError(error, 'ghost_tag_fetch');
    }
  },
});
mcpServer.addResource(ghostTagResource);
console.log(`Added Resource: ${ghostTagResource.name}`);

// Ghost Post Resource
const ghostPostResource = new Resource({
  name: 'ghost/post',
  description: 'Represents a post in Ghost CMS.',
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique ID of the post' },
      uuid: { type: 'string', description: 'UUID of the post' },
      title: { type: 'string', description: 'The title of the post' },
      slug: {
        type: 'string',
        description: 'URL-friendly version of the title',
      },
      html: {
        type: ['string', 'null'],
        description: 'The post content as HTML',
      },
      plaintext: {
        type: ['string', 'null'],
        description: 'The post content as plain text',
      },
      feature_image: {
        type: ['string', 'null'],
        description: 'URL of the featured image',
      },
      feature_image_alt: {
        type: ['string', 'null'],
        description: 'Alt text for the featured image',
      },
      feature_image_caption: {
        type: ['string', 'null'],
        description: 'Caption for the featured image',
      },
      featured: {
        type: 'boolean',
        description: 'Whether the post is featured',
      },
      status: {
        type: 'string',
        enum: ['draft', 'published', 'scheduled'],
        description: 'The status of the post',
      },
      visibility: {
        type: 'string',
        enum: ['public', 'members', 'paid', 'tiers'],
        description: 'The visibility level of the post',
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        description: 'Date/time when the post was created',
      },
      updated_at: {
        type: 'string',
        format: 'date-time',
        description: 'Date/time when the post was last updated',
      },
      published_at: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'Date/time when the post was published',
      },
      custom_excerpt: {
        type: ['string', 'null'],
        description: 'Custom excerpt for the post',
      },
      tags: {
        type: 'array',
        items: { $ref: 'ghost/tag#/schema' },
        description: 'Associated tags',
      },
      meta_title: {
        type: ['string', 'null'],
        description: 'Custom meta title for SEO',
      },
      meta_description: {
        type: ['string', 'null'],
        description: 'Custom meta description for SEO',
      },
    },
    required: ['id', 'uuid', 'title', 'slug', 'status'],
  },
  // Resource fetching handler
  async fetch(uri) {
    try {
      // Extract post ID from URI (e.g., "ghost/post/123")
      const postId = uri.split('/').pop();

      // You'll need to implement a getPost service method
      // For now, returning an error as this would require adding to ghostService.js
      throw new MCPError('Post fetching not yet implemented', 'NOT_IMPLEMENTED', { postId });
    } catch (error) {
      return handleToolError(error, 'ghost_post_fetch');
    }
  },
});
mcpServer.addResource(ghostPostResource);
console.log(`Added Resource: ${ghostPostResource.name}`);

// --- Define Tools (with improved error handling) ---

console.log('Defining MCP Tools...');

// Create Post Tool
const createPostTool = new Tool({
  name: 'ghost_create_post',
  description: 'Creates a new post in Ghost CMS.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The title of the post.',
      },
      html: {
        type: 'string',
        description: 'The HTML content of the post.',
      },
      status: {
        type: 'string',
        enum: ['draft', 'published', 'scheduled'],
        default: 'draft',
        description: "The status of the post. Use 'scheduled' with a future published_at date.",
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Optional: List of tag names to associate with the post. Tags will be created if they don't exist.",
      },
      published_at: {
        type: 'string',
        format: 'date-time',
        description:
          "Optional: ISO 8601 date/time to publish the post. Required if status is 'scheduled'.",
      },
      custom_excerpt: {
        type: 'string',
        description: 'Optional: A custom short summary for the post.',
      },
      feature_image: {
        type: 'string',
        format: 'url',
        description:
          'Optional: URL of the image (e.g., from ghost_upload_image tool) to use as the featured image.',
      },
      feature_image_alt: {
        type: 'string',
        description: 'Optional: Alt text for the featured image.',
      },
      feature_image_caption: {
        type: 'string',
        description: 'Optional: Caption for the featured image.',
      },
      meta_title: {
        type: 'string',
        description:
          'Optional: Custom title for SEO (max 300 chars). Defaults to post title if omitted.',
      },
      meta_description: {
        type: 'string',
        description:
          'Optional: Custom description for SEO (max 500 chars). Defaults to excerpt or generated summary if omitted.',
      },
    },
    required: ['title', 'html'],
  },
  outputSchema: {
    $ref: 'ghost/post#/schema',
  },
  implementation: async (input) => {
    console.log(`Executing tool: ${createPostTool.name} with input keys:`, Object.keys(input));
    try {
      const createdPost = await createPostService(input);
      console.log(`Tool ${createPostTool.name} executed successfully. Post ID: ${createdPost.id}`);
      return createdPost;
    } catch (error) {
      return handleToolError(error, createPostTool.name);
    }
  },
});
mcpServer.addTool(createPostTool);
console.log(`Added Tool: ${createPostTool.name}`);

// Upload Image Tool
const uploadImageTool = new Tool({
  name: 'ghost_upload_image',
  description:
    'Downloads an image from a URL, processes it, uploads it to Ghost CMS, and returns the final Ghost image URL and alt text.',
  inputSchema: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        format: 'url',
        description: 'The publicly accessible URL of the image to upload.',
      },
      alt: {
        type: 'string',
        description:
          'Optional: Alt text for the image. If omitted, a default will be generated from the filename.',
      },
    },
    required: ['imageUrl'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        format: 'url',
        description: 'The final URL of the image hosted on Ghost.',
      },
      alt: {
        type: 'string',
        description: 'The alt text determined for the image.',
      },
    },
    required: ['url', 'alt'],
  },
  implementation: async (input) => {
    console.log(`Executing tool: ${uploadImageTool.name} for URL:`, input.imageUrl);
    const { imageUrl, alt } = input;
    let downloadedPath = null;
    let processedPath = null;

    try {
      // --- 1. Validate URL for SSRF protection ---
      const urlValidation = validateImageUrl(imageUrl);
      if (!urlValidation.isValid) {
        throw new Error(`Invalid image URL: ${urlValidation.error}`);
      }

      // --- 2. Download the image with security controls ---
      const axiosConfig = createSecureAxiosConfig(urlValidation.sanitizedUrl);
      const response = await axios(axiosConfig);
      const tempDir = os.tmpdir();
      const extension = path.extname(imageUrl.split('?')[0]) || '.tmp';
      const originalFilenameHint =
        path.basename(imageUrl.split('?')[0]) || `image-${uuidv4()}${extension}`;
      downloadedPath = path.join(tempDir, `mcp-download-${uuidv4()}${extension}`);

      const writer = fs.createWriteStream(downloadedPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      console.log(`Downloaded image to temporary path: ${downloadedPath}`);

      // --- 2. Process the image ---
      processedPath = await processImage(downloadedPath, tempDir);
      console.log(`Processed image path: ${processedPath}`);

      // --- 3. Determine Alt Text ---
      const defaultAlt = getDefaultAltText(originalFilenameHint);
      const finalAltText = alt || defaultAlt;
      console.log(`Using alt text: "${finalAltText}"`);

      // --- 4. Upload processed image to Ghost ---
      const uploadResult = await uploadGhostImage(processedPath);
      console.log(`Uploaded processed image to Ghost: ${uploadResult.url}`);

      // --- 5. Return result ---
      return {
        url: uploadResult.url,
        alt: finalAltText,
      };
    } catch (error) {
      return handleToolError(
        new MCPError(`Failed to upload image from URL ${imageUrl}`, 'IMAGE_UPLOAD_ERROR', {
          imageUrl,
          originalError: error.message,
        }),
        uploadImageTool.name
      );
    } finally {
      // --- 6. Cleanup temporary files ---
      if (downloadedPath) {
        fs.unlink(downloadedPath, (err) => {
          if (err) console.error('Error deleting temporary downloaded file:', downloadedPath, err);
        });
      }
      if (processedPath && processedPath !== downloadedPath) {
        fs.unlink(processedPath, (err) => {
          if (err) console.error('Error deleting temporary processed file:', processedPath, err);
        });
      }
    }
  },
});

// Helper function for default alt text
const getDefaultAltText = (filePath) => {
  try {
    const originalFilename = path.basename(filePath).split('.').slice(0, -1).join('.');
    const nameWithoutIds = originalFilename
      .replace(/^(processed-|mcp-download-|mcp-upload-)\d+-\d+-?/, '')
      .replace(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}-?/, '');
    return nameWithoutIds.replace(/[-_]/g, ' ').trim() || 'Uploaded image';
  } catch (e) {
    return 'Uploaded image';
  }
};

mcpServer.addTool(uploadImageTool);
console.log(`Added Tool: ${uploadImageTool.name}`);

// Get Tags Tool
const getTagsTool = new Tool({
  name: 'ghost_get_tags',
  description: 'Retrieves a list of tags from Ghost CMS. Can optionally filter by tag name.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional: Filter tags by exact name. If omitted, all tags are returned.',
      },
    },
  },
  outputSchema: {
    type: 'array',
    items: { $ref: 'ghost/tag#/schema' },
  },
  implementation: async (input) => {
    console.log(`Executing tool: ${getTagsTool.name}`);
    try {
      const tags = await getGhostTags();
      if (input.name) {
        const filteredTags = tags.filter(
          (tag) => tag.name.toLowerCase() === input.name.toLowerCase()
        );
        console.log(
          `Filtered tags by name "${input.name}". Found ${filteredTags.length} match(es).`
        );
        return filteredTags;
      }
      console.log(`Retrieved ${tags.length} tags from Ghost.`);
      return tags;
    } catch (error) {
      return handleToolError(error, getTagsTool.name);
    }
  },
});
mcpServer.addTool(getTagsTool);
console.log(`Added Tool: ${getTagsTool.name}`);

// Create Tag Tool
const createTagTool = new Tool({
  name: 'ghost_create_tag',
  description: 'Creates a new tag in Ghost CMS.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the tag.',
      },
      description: {
        type: 'string',
        description: 'Optional: A description for the tag.',
      },
      slug: {
        type: 'string',
        pattern: '^[a-z0-9\\-]+$',
        description:
          'Optional: A URL-friendly slug for the tag. Will be auto-generated from the name if omitted.',
      },
    },
    required: ['name'],
  },
  outputSchema: {
    $ref: 'ghost/tag#/schema',
  },
  implementation: async (input) => {
    console.log(`Executing tool: ${createTagTool.name} with name:`, input.name);
    try {
      const createdTag = await createGhostTag(input);
      console.log(`Tool ${createTagTool.name} executed successfully. Tag ID: ${createdTag.id}`);
      return createdTag;
    } catch (error) {
      return handleToolError(error, createTagTool.name);
    }
  },
});
mcpServer.addTool(createTagTool);
console.log(`Added Tool: ${createTagTool.name}`);

// --- Transport Configuration ---

/**
 * Start MCP Server with specified transport
 * @param {string} transport - Transport type: 'stdio', 'http', 'websocket'
 * @param {object} options - Transport-specific options
 */
const startMCPServer = async (transport = 'http', options = {}) => {
  try {
    console.log(`Starting MCP Server with ${transport} transport...`);

    switch (transport) {
      case 'stdio':
        // Standard I/O transport - best for CLI tools
        const stdioTransport = new StdioServerTransport();
        await mcpServer.connect(stdioTransport);
        console.log('MCP Server running on stdio transport');
        break;

      case 'http':
      case 'sse':
        // HTTP with Server-Sent Events - good for web clients
        const port = options.port || 3001;
        const app = express();

        // CORS configuration for web clients
        app.use((req, res, next) => {
          res.header('Access-Control-Allow-Origin', options.cors || '*');
          res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.header('Access-Control-Allow-Headers', 'Content-Type');
          next();
        });

        // SSE endpoint
        const sseTransport = new SSEServerTransport();
        app.get('/mcp/sse', sseTransport.handler());

        // Health check
        app.get('/mcp/health', (req, res) => {
          res.json({
            status: 'ok',
            transport: 'sse',
            resources: mcpServer.listResources().map((r) => r.name),
            tools: mcpServer.listTools().map((t) => t.name),
          });
        });

        await mcpServer.connect(sseTransport);

        const server = app.listen(port, () => {
          console.log(`MCP Server (SSE) listening on port ${port}`);
          console.log(`SSE endpoint: http://localhost:${port}/mcp/sse`);
          console.log(`Health check: http://localhost:${port}/mcp/health`);
        });

        // Store server instance for cleanup
        mcpServer._httpServer = server;
        break;

      case 'websocket':
        // WebSocket transport - best for real-time bidirectional communication
        const wsPort = options.port || 3001;
        const wss = new WebSocketServer({ port: wsPort });

        wss.on('connection', async (ws) => {
          console.log('New WebSocket connection');
          const wsTransport = new WebSocketServerTransport(ws);
          await mcpServer.connect(wsTransport);
        });

        console.log(`MCP Server (WebSocket) listening on port ${wsPort}`);
        console.log(`WebSocket URL: ws://localhost:${wsPort}`);

        // Store WebSocket server instance for cleanup
        mcpServer._wss = wss;
        break;

      default:
        throw new Error(`Unknown transport type: ${transport}`);
    }

    console.log(
      'Available Resources:',
      mcpServer.listResources().map((r) => r.name)
    );
    console.log(
      'Available Tools:',
      mcpServer.listTools().map((t) => t.name)
    );
  } catch (error) {
    console.error('Failed to start MCP Server:', error);
    process.exit(1);
  }
};

// Graceful shutdown handler
const shutdown = async () => {
  console.log('\nShutting down MCP Server...');

  if (mcpServer._httpServer) {
    mcpServer._httpServer.close();
  }

  if (mcpServer._wss) {
    mcpServer._wss.close();
  }

  await mcpServer.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Export the server instance and start function
export { mcpServer, startMCPServer, MCPError };

// If running directly, start with transport from environment or default to HTTP
if (import.meta.url === `file://${process.argv[1]}`) {
  const transport = process.env.MCP_TRANSPORT || 'http';
  const port = parseInt(process.env.MCP_PORT || '3001');
  const cors = process.env.MCP_CORS || '*';

  startMCPServer(transport, { port, cors });
}
