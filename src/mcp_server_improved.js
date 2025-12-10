#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

// Lazy-loaded modules (to avoid Node.js v25 Buffer compatibility issues at startup)
let ghostService = null;
let postService = null;
let imageProcessingService = null;
let urlValidator = null;

const loadServices = async () => {
  if (!ghostService) {
    ghostService = await import('./services/ghostService.js');
    postService = await import('./services/postService.js');
    imageProcessingService = await import('./services/imageProcessingService.js');
    urlValidator = await import('./utils/urlValidator.js');
  }
};

// Generate UUID without external dependency
const generateUuid = () => crypto.randomUUID();

// Helper function for default alt text
const getDefaultAltText = (filePath) => {
  try {
    const originalFilename = path.basename(filePath).split('.').slice(0, -1).join('.');
    const nameWithoutIds = originalFilename
      .replace(/^(processed-|mcp-download-|mcp-upload-)\d+-\d+-?/, '')
      .replace(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}-?/, '');
    return nameWithoutIds.replace(/[-_]/g, ' ').trim() || 'Uploaded image';
  } catch (_e) {
    return 'Uploaded image';
  }
};

// Create server instance with new API
const server = new McpServer({
  name: 'ghost-mcp-server',
  version: '1.0.0',
});

// --- Register Tools ---

// Get Tags Tool
server.tool(
  'ghost_get_tags',
  'Retrieves a list of tags from Ghost CMS. Can optionally filter by tag name.',
  {
    name: z
      .string()
      .optional()
      .describe('Filter tags by exact name. If omitted, all tags are returned.'),
  },
  async ({ name }) => {
    console.error(`Executing tool: ghost_get_tags`);
    try {
      await loadServices();
      const tags = await ghostService.getTags();
      let result = tags;

      if (name) {
        result = tags.filter((tag) => tag.name.toLowerCase() === name.toLowerCase());
        console.error(`Filtered tags by name "${name}". Found ${result.length} match(es).`);
      } else {
        console.error(`Retrieved ${tags.length} tags from Ghost.`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_tags:`, error);
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Create Tag Tool
server.tool(
  'ghost_create_tag',
  'Creates a new tag in Ghost CMS.',
  {
    name: z.string().describe('The name of the tag.'),
    description: z.string().optional().describe('A description for the tag.'),
    slug: z
      .string()
      .optional()
      .describe(
        'A URL-friendly slug for the tag. Will be auto-generated from the name if omitted.'
      ),
  },
  async ({ name, description, slug }) => {
    console.error(`Executing tool: ghost_create_tag with name: ${name}`);
    try {
      await loadServices();
      const createdTag = await ghostService.createTag({ name, description, slug });
      console.error(`Tag created successfully. Tag ID: ${createdTag.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdTag, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_tag:`, error);
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Upload Image Tool
server.tool(
  'ghost_upload_image',
  'Downloads an image from a URL, processes it, uploads it to Ghost CMS, and returns the final Ghost image URL and alt text.',
  {
    imageUrl: z.string().describe('The publicly accessible URL of the image to upload.'),
    alt: z
      .string()
      .optional()
      .describe(
        'Alt text for the image. If omitted, a default will be generated from the filename.'
      ),
  },
  async ({ imageUrl, alt }) => {
    console.error(`Executing tool: ghost_upload_image for URL: ${imageUrl}`);
    let downloadedPath = null;
    let processedPath = null;

    try {
      await loadServices();

      // 1. Validate URL for SSRF protection
      const urlValidation = urlValidator.validateImageUrl(imageUrl);
      if (!urlValidation.isValid) {
        throw new Error(`Invalid image URL: ${urlValidation.error}`);
      }

      // 2. Download the image with security controls
      const axiosConfig = urlValidator.createSecureAxiosConfig(urlValidation.sanitizedUrl);
      const response = await axios(axiosConfig);
      const tempDir = os.tmpdir();
      const extension = path.extname(imageUrl.split('?')[0]) || '.tmp';
      const originalFilenameHint =
        path.basename(imageUrl.split('?')[0]) || `image-${generateUuid()}${extension}`;
      downloadedPath = path.join(tempDir, `mcp-download-${generateUuid()}${extension}`);

      const writer = fs.createWriteStream(downloadedPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      console.error(`Downloaded image to temporary path: ${downloadedPath}`);

      // 3. Process the image
      processedPath = await imageProcessingService.processImage(downloadedPath, tempDir);
      console.error(`Processed image path: ${processedPath}`);

      // 4. Determine Alt Text
      const defaultAlt = getDefaultAltText(originalFilenameHint);
      const finalAltText = alt || defaultAlt;
      console.error(`Using alt text: "${finalAltText}"`);

      // 5. Upload processed image to Ghost
      const uploadResult = await ghostService.uploadImage(processedPath);
      console.error(`Uploaded processed image to Ghost: ${uploadResult.url}`);

      // 6. Return result
      const result = {
        url: uploadResult.url,
        alt: finalAltText,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_upload_image:`, error);
      return {
        content: [{ type: 'text', text: `Error uploading image: ${error.message}` }],
        isError: true,
      };
    } finally {
      // Cleanup temporary files
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
  }
);

// Create Post Tool
server.tool(
  'ghost_create_post',
  'Creates a new post in Ghost CMS.',
  {
    title: z.string().describe('The title of the post.'),
    html: z.string().describe('The HTML content of the post.'),
    status: z
      .enum(['draft', 'published', 'scheduled'])
      .optional()
      .describe("The status of the post. Defaults to 'draft'."),
    tags: z
      .array(z.string())
      .optional()
      .describe(
        "List of tag names to associate with the post. Tags will be created if they don't exist."
      ),
    published_at: z
      .string()
      .optional()
      .describe("ISO 8601 date/time to publish the post. Required if status is 'scheduled'."),
    custom_excerpt: z.string().optional().describe('A custom short summary for the post.'),
    feature_image: z
      .string()
      .optional()
      .describe(
        'URL of the image (e.g., from ghost_upload_image tool) to use as the featured image.'
      ),
    feature_image_alt: z.string().optional().describe('Alt text for the featured image.'),
    feature_image_caption: z.string().optional().describe('Caption for the featured image.'),
    meta_title: z
      .string()
      .optional()
      .describe('Custom title for SEO (max 300 chars). Defaults to post title if omitted.'),
    meta_description: z
      .string()
      .optional()
      .describe(
        'Custom description for SEO (max 500 chars). Defaults to excerpt or generated summary if omitted.'
      ),
  },
  async (input) => {
    console.error(`Executing tool: ghost_create_post with title: ${input.title}`);
    try {
      await loadServices();
      const createdPost = await postService.createPostService(input);
      console.error(`Post created successfully. Post ID: ${createdPost.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdPost, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_post:`, error);
      return {
        content: [{ type: 'text', text: `Error creating post: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// --- Main Entry Point ---

async function main() {
  console.error('Starting Ghost MCP Server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Ghost MCP Server running on stdio transport');
  console.error(
    'Available tools: ghost_get_tags, ghost_create_tag, ghost_upload_image, ghost_create_post'
  );
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
