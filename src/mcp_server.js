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
import { ValidationError } from './errors/index.js';
import { validateToolInput } from './utils/validation.js';
import { trackTempFile, cleanupTempFiles } from './utils/tempFileManager.js';
import {
  createTagSchema,
  updateTagSchema,
  tagQueryBaseSchema,
  ghostIdSchema,
  emailSchema,
  createPostSchema,
  updatePostSchema,
  postQuerySchema,
  createMemberSchema,
  updateMemberSchema,
  memberQuerySchema,
  createTierSchema,
  updateTierSchema,
  tierQuerySchema,
  createNewsletterSchema,
  updateNewsletterSchema,
  newsletterQuerySchema,
  createPageSchema,
  updatePageSchema,
  pageQuerySchema,
} from './schemas/index.js';

// Load environment variables
dotenv.config();

// Lazy-loaded modules (to avoid Node.js v25 Buffer compatibility issues at startup)
let ghostService = null;
let postService = null;
let pageService = null;
let newsletterService = null;
let imageProcessingService = null;
let urlValidator = null;

const loadServices = async () => {
  if (!ghostService) {
    ghostService = await import('./services/ghostServiceImproved.js');
    postService = await import('./services/postService.js');
    pageService = await import('./services/pageService.js');
    newsletterService = await import('./services/newsletterService.js');
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

/**
 * Escapes single quotes in NQL filter values by doubling them.
 * This prevents filter injection attacks when building NQL query strings.
 * Example: "O'Reilly" becomes "O''Reilly" for use in name:'O''Reilly'
 * @param {string} value - The value to escape
 * @returns {string} The escaped value safe for NQL filter strings
 */
const escapeNqlValue = (value) => {
  return value.replace(/'/g, "''");
};

// Create server instance with new API
const server = new McpServer({
  name: 'ghost-mcp-server',
  version: '1.0.0',
});

// --- Register Tools ---

// --- Schema Definitions for Tools ---
const getTagsSchema = tagQueryBaseSchema.partial();
const getTagSchema = z
  .object({
    id: ghostIdSchema.optional().describe('The ID of the tag to retrieve.'),
    slug: z.string().optional().describe('The slug of the tag to retrieve.'),
    include: z
      .string()
      .optional()
      .describe('Additional resources to include (e.g., "count.posts").'),
  })
  .refine((data) => data.id || data.slug, {
    message: 'Either id or slug is required to retrieve a tag',
  });
const updateTagInputSchema = updateTagSchema.extend({ id: ghostIdSchema });
const deleteTagSchema = z.object({ id: ghostIdSchema });

// Get Tags Tool
server.tool(
  'ghost_get_tags',
  'Retrieves a list of tags from Ghost CMS with pagination, filtering, sorting, and relation inclusion. Supports filtering by name, slug, visibility, or custom NQL filter expressions.',
  getTagsSchema,
  async (rawInput) => {
    const validation = validateToolInput(getTagsSchema, rawInput, 'ghost_get_tags');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_tags`);
    try {
      await loadServices();

      // Build options object with provided parameters
      const options = {};
      if (input.limit !== undefined) options.limit = input.limit;
      if (input.page !== undefined) options.page = input.page;
      if (input.order !== undefined) options.order = input.order;
      if (input.include !== undefined) options.include = input.include;

      // Build filter string from individual filter parameters
      const filters = [];
      if (input.name) filters.push(`name:'${escapeNqlValue(input.name)}'`);
      if (input.slug) filters.push(`slug:'${escapeNqlValue(input.slug)}'`);
      if (input.visibility) filters.push(`visibility:'${input.visibility}'`); // visibility is enum-validated, no escaping needed
      if (input.filter) filters.push(input.filter);

      if (filters.length > 0) {
        options.filter = filters.join('+');
      }

      const tags = await ghostService.getTags(options);
      console.error(`Retrieved ${tags.length} tags from Ghost.`);

      const result = tags;

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_tags:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tags retrieval');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
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
  createTagSchema,
  async (rawInput) => {
    const validation = validateToolInput(createTagSchema, rawInput, 'ghost_create_tag');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_create_tag with name: ${input.name}`);
    try {
      await loadServices();
      const createdTag = await ghostService.createTag(input);
      console.error(`Tag created successfully. Tag ID: ${createdTag.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdTag, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_tag:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tag creation');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Tag Tool
server.tool(
  'ghost_get_tag',
  'Retrieves a single tag from Ghost CMS by ID or slug.',
  getTagSchema,
  async (rawInput) => {
    const validation = validateToolInput(getTagSchema, rawInput, 'ghost_get_tag');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id, slug, include } = validation.data;

    console.error(`Executing tool: ghost_get_tag`);
    try {
      await loadServices();

      // If slug is provided, use the slug/slug-name format
      const identifier = slug ? `slug/${slug}` : id;
      const options = include ? { include } : {};

      const tag = await ghostService.getTag(identifier, options);
      console.error(`Tag retrieved successfully. Tag ID: ${tag.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(tag, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_tag:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tag retrieval');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Update Tag Tool
server.tool(
  'ghost_update_tag',
  'Updates an existing tag in Ghost CMS.',
  updateTagInputSchema,
  async (rawInput) => {
    const validation = validateToolInput(updateTagInputSchema, rawInput, 'ghost_update_tag');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_update_tag for ID: ${input.id}`);
    try {
      if (!input.id) {
        throw new Error('Tag ID is required');
      }

      await loadServices();

      // Build update data object with only provided fields (exclude id from update data)
      const { id, ...updateData } = input;

      const updatedTag = await ghostService.updateTag(id, updateData);
      console.error(`Tag updated successfully. Tag ID: ${updatedTag.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedTag, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_tag:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tag update');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Delete Tag Tool
server.tool(
  'ghost_delete_tag',
  'Deletes a tag from Ghost CMS by ID. This operation is permanent.',
  deleteTagSchema,
  async (rawInput) => {
    const validation = validateToolInput(deleteTagSchema, rawInput, 'ghost_delete_tag');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_delete_tag for ID: ${id}`);
    try {
      if (!id) {
        throw new Error('Tag ID is required');
      }

      await loadServices();

      await ghostService.deleteTag(id);
      console.error(`Tag deleted successfully. Tag ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Tag with ID ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_tag:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tag deletion');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// --- Image Schema ---
const uploadImageSchema = z.object({
  imageUrl: z.string().describe('The publicly accessible URL of the image to upload.'),
  alt: z
    .string()
    .optional()
    .describe('Alt text for the image. If omitted, a default will be generated from the filename.'),
});

// Upload Image Tool
server.tool(
  'ghost_upload_image',
  'Downloads an image from a URL, processes it, uploads it to Ghost CMS, and returns the final Ghost image URL and alt text.',
  uploadImageSchema,
  async (rawInput) => {
    const validation = validateToolInput(uploadImageSchema, rawInput, 'ghost_upload_image');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { imageUrl, alt } = validation.data;

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
      // Track temp file for cleanup on process exit
      trackTempFile(downloadedPath);
      console.error(`Downloaded image to temporary path: ${downloadedPath}`);

      // 3. Process the image
      processedPath = await imageProcessingService.processImage(downloadedPath, tempDir);
      // Track processed file for cleanup on process exit
      if (processedPath !== downloadedPath) {
        trackTempFile(processedPath);
      }
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
      // Cleanup temporary files with proper async/await
      await cleanupTempFiles([downloadedPath, processedPath], console);
    }
  }
);

// --- Post Schema Definitions ---
const getPostsSchema = postQuerySchema.extend({
  status: z
    .enum(['published', 'draft', 'scheduled', 'all'])
    .optional()
    .describe('Filter posts by status. Options: published, draft, scheduled, all.'),
});
const getPostSchema = z
  .object({
    id: ghostIdSchema.optional().describe('The ID of the post to retrieve.'),
    slug: z.string().optional().describe('The slug of the post to retrieve.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated list of relations to include (e.g., "tags,authors").'),
  })
  .refine((data) => data.id || data.slug, {
    message: 'Either id or slug is required to retrieve a post',
  });
const searchPostsSchema = z.object({
  query: z.string().min(1).describe('Search query to find in post titles.'),
  status: z
    .enum(['published', 'draft', 'scheduled', 'all'])
    .optional()
    .describe('Filter by post status. Default searches all statuses.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of results (1-50). Default is 15.'),
});
const updatePostInputSchema = updatePostSchema.extend({ id: ghostIdSchema });
const deletePostSchema = z.object({ id: ghostIdSchema });

// Create Post Tool
server.tool(
  'ghost_create_post',
  'Creates a new post in Ghost CMS.',
  createPostSchema,
  async (rawInput) => {
    const validation = validateToolInput(createPostSchema, rawInput, 'ghost_create_post');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

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
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Post creation');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error creating post: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Posts Tool
server.tool(
  'ghost_get_posts',
  'Retrieves a list of posts from Ghost CMS with pagination, filtering, and sorting options.',
  getPostsSchema,
  async (rawInput) => {
    const validation = validateToolInput(getPostsSchema, rawInput, 'ghost_get_posts');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_posts`);
    try {
      await loadServices();

      // Build options object with provided parameters
      const options = {};
      if (input.limit !== undefined) options.limit = input.limit;
      if (input.page !== undefined) options.page = input.page;
      if (input.status !== undefined) options.status = input.status;
      if (input.include !== undefined) options.include = input.include;
      if (input.filter !== undefined) options.filter = input.filter;
      if (input.order !== undefined) options.order = input.order;
      if (input.fields !== undefined) options.fields = input.fields;
      if (input.formats !== undefined) options.formats = input.formats;

      const posts = await ghostService.getPosts(options);
      console.error(`Retrieved ${posts.length} posts from Ghost.`);

      return {
        content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_posts:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Posts retrieval');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving posts: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Post Tool
server.tool(
  'ghost_get_post',
  'Retrieves a single post from Ghost CMS by ID or slug.',
  getPostSchema,
  async (rawInput) => {
    const validation = validateToolInput(getPostSchema, rawInput, 'ghost_get_post');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_post`);
    try {
      await loadServices();

      // Build options object
      const options = {};
      if (input.include !== undefined) options.include = input.include;

      // Determine identifier (prefer ID over slug)
      const identifier = input.id || `slug/${input.slug}`;

      const post = await ghostService.getPost(identifier, options);
      console.error(`Retrieved post: ${post.title} (ID: ${post.id})`);

      return {
        content: [{ type: 'text', text: JSON.stringify(post, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_post:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Post retrieval');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving post: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Search Posts Tool
server.tool(
  'ghost_search_posts',
  'Search for posts in Ghost CMS by query string with optional status filtering.',
  searchPostsSchema,
  async (rawInput) => {
    const validation = validateToolInput(searchPostsSchema, rawInput, 'ghost_search_posts');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_search_posts with query: ${input.query}`);
    try {
      await loadServices();

      // Build options object with provided parameters
      const options = {};
      if (input.status !== undefined) options.status = input.status;
      if (input.limit !== undefined) options.limit = input.limit;

      const posts = await ghostService.searchPosts(input.query, options);
      console.error(`Found ${posts.length} posts matching "${input.query}".`);

      return {
        content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_search_posts:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Post search');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error searching posts: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Update Post Tool
server.tool(
  'ghost_update_post',
  'Updates an existing post in Ghost CMS. Can update title, content, status, tags, images, and SEO fields.',
  updatePostInputSchema,
  async (rawInput) => {
    const validation = validateToolInput(updatePostInputSchema, rawInput, 'ghost_update_post');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_update_post for post ID: ${input.id}`);
    try {
      await loadServices();

      // Extract ID from input and build update data
      const { id, ...updateData } = input;

      const updatedPost = await ghostService.updatePost(id, updateData);
      console.error(`Post updated successfully. Post ID: ${updatedPost.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedPost, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_post:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Post update');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error updating post: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Delete Post Tool
server.tool(
  'ghost_delete_post',
  'Deletes a post from Ghost CMS by ID. This operation is permanent and cannot be undone.',
  deletePostSchema,
  async (rawInput) => {
    const validation = validateToolInput(deletePostSchema, rawInput, 'ghost_delete_post');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_delete_post for post ID: ${id}`);
    try {
      await loadServices();

      await ghostService.deletePost(id);
      console.error(`Post deleted successfully. Post ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Post ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_post:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Post deletion');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error deleting post: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// PAGE TOOLS
// Pages are similar to posts but do NOT support tags
// =============================================================================

// --- Page Schema Definitions ---
const getPageSchema = z
  .object({
    id: ghostIdSchema.optional().describe('The ID of the page to retrieve.'),
    slug: z.string().optional().describe('The slug of the page to retrieve.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated list of relations to include (e.g., "authors").'),
  })
  .refine((data) => data.id || data.slug, {
    message: 'Either id or slug is required to retrieve a page',
  });
const updatePageInputSchema = z
  .object({ id: ghostIdSchema.describe('The ID of the page to update.') })
  .merge(updatePageSchema);
const deletePageSchema = z.object({ id: ghostIdSchema.describe('The ID of the page to delete.') });
const searchPagesSchema = z.object({
  query: z
    .string()
    .min(1, 'Search query cannot be empty')
    .describe('Search query to find in page titles.'),
  status: z
    .enum(['published', 'draft', 'scheduled', 'all'])
    .optional()
    .describe('Filter by page status. Default searches all statuses.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(15)
    .optional()
    .describe('Maximum number of results (1-50). Default is 15.'),
});

// Get Pages Tool
server.tool(
  'ghost_get_pages',
  'Retrieves a list of pages from Ghost CMS with pagination, filtering, and sorting options.',
  pageQuerySchema,
  async (rawInput) => {
    const validation = validateToolInput(pageQuerySchema, rawInput, 'ghost_get_pages');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_pages`);
    try {
      await loadServices();

      const options = {};
      if (input.limit !== undefined) options.limit = input.limit;
      if (input.page !== undefined) options.page = input.page;
      if (input.filter !== undefined) options.filter = input.filter;
      if (input.include !== undefined) options.include = input.include;
      if (input.fields !== undefined) options.fields = input.fields;
      if (input.formats !== undefined) options.formats = input.formats;
      if (input.order !== undefined) options.order = input.order;

      const pages = await ghostService.getPages(options);
      console.error(`Retrieved ${pages.length} pages from Ghost.`);

      return {
        content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_pages:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Page query');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving pages: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Page Tool
server.tool(
  'ghost_get_page',
  'Retrieves a single page from Ghost CMS by ID or slug.',
  getPageSchema,
  async (rawInput) => {
    const validation = validateToolInput(getPageSchema, rawInput, 'ghost_get_page');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_page`);
    try {
      await loadServices();

      const options = {};
      if (input.include !== undefined) options.include = input.include;

      const identifier = input.id || `slug/${input.slug}`;

      const page = await ghostService.getPage(identifier, options);
      console.error(`Retrieved page: ${page.title} (ID: ${page.id})`);

      return {
        content: [{ type: 'text', text: JSON.stringify(page, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_page:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Get page');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving page: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Create Page Tool
server.tool(
  'ghost_create_page',
  'Creates a new page in Ghost CMS. Note: Pages do NOT typically use tags (unlike posts).',
  createPageSchema,
  async (rawInput) => {
    const validation = validateToolInput(createPageSchema, rawInput, 'ghost_create_page');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_create_page with title: ${input.title}`);
    try {
      await loadServices();

      const createdPage = await pageService.createPageService(input);
      console.error(`Page created successfully. Page ID: ${createdPage.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdPage, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_page:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Page creation');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error creating page: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Update Page Tool
server.tool(
  'ghost_update_page',
  'Updates an existing page in Ghost CMS. Can update title, content, status, images, and SEO fields.',
  updatePageInputSchema,
  async (rawInput) => {
    const validation = validateToolInput(updatePageInputSchema, rawInput, 'ghost_update_page');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_update_page for page ID: ${input.id}`);
    try {
      await loadServices();

      const { id, ...updateData } = input;

      const updatedPage = await ghostService.updatePage(id, updateData);
      console.error(`Page updated successfully. Page ID: ${updatedPage.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedPage, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_page:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Page update');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error updating page: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Delete Page Tool
server.tool(
  'ghost_delete_page',
  'Deletes a page from Ghost CMS by ID. This operation is permanent and cannot be undone.',
  deletePageSchema,
  async (rawInput) => {
    const validation = validateToolInput(deletePageSchema, rawInput, 'ghost_delete_page');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_delete_page for page ID: ${id}`);
    try {
      await loadServices();

      await ghostService.deletePage(id);
      console.error(`Page deleted successfully. Page ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Page ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_page:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Page deletion');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error deleting page: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Search Pages Tool
server.tool(
  'ghost_search_pages',
  'Search for pages in Ghost CMS by query string with optional status filtering.',
  searchPagesSchema,
  async (rawInput) => {
    const validation = validateToolInput(searchPagesSchema, rawInput, 'ghost_search_pages');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_search_pages with query: ${input.query}`);
    try {
      await loadServices();

      const options = {};
      if (input.status !== undefined) options.status = input.status;
      if (input.limit !== undefined) options.limit = input.limit;

      const pages = await ghostService.searchPages(input.query, options);
      console.error(`Found ${pages.length} pages matching "${input.query}".`);

      return {
        content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_search_pages:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Page search');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error searching pages: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// MEMBER TOOLS
// Member management for Ghost CMS subscribers
// =============================================================================

// --- Member Schema Definitions ---
const updateMemberInputSchema = z.object({ id: ghostIdSchema }).merge(updateMemberSchema);
const deleteMemberSchema = z.object({ id: ghostIdSchema });
const getMembersSchema = memberQuerySchema.omit({ search: true });
const getMemberSchema = z
  .object({
    id: ghostIdSchema.optional().describe('The ID of the member to retrieve.'),
    email: emailSchema.optional().describe('The email of the member to retrieve.'),
  })
  .refine((data) => data.id || data.email, {
    message: 'Either id or email must be provided',
  });
const searchMembersSchema = z.object({
  query: z.string().min(1).describe('Search query to match against member name or email.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of results to return (1-50). Default is 15.'),
});

// Create Member Tool
server.tool(
  'ghost_create_member',
  'Creates a new member (subscriber) in Ghost CMS.',
  createMemberSchema,
  async (rawInput) => {
    const validation = validateToolInput(createMemberSchema, rawInput, 'ghost_create_member');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_create_member with email: ${input.email}`);
    try {
      await loadServices();

      const createdMember = await ghostService.createMember(input);
      console.error(`Member created successfully. Member ID: ${createdMember.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdMember, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_member:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Member creation');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error creating member: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Update Member Tool
server.tool(
  'ghost_update_member',
  'Updates an existing member in Ghost CMS. All fields except id are optional.',
  updateMemberInputSchema,
  async (rawInput) => {
    const validation = validateToolInput(updateMemberInputSchema, rawInput, 'ghost_update_member');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_update_member for member ID: ${input.id}`);
    try {
      await loadServices();

      const { id, ...updateData } = input;

      const updatedMember = await ghostService.updateMember(id, updateData);
      console.error(`Member updated successfully. Member ID: ${updatedMember.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedMember, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_member:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Member update');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error updating member: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Delete Member Tool
server.tool(
  'ghost_delete_member',
  'Deletes a member from Ghost CMS by ID. This operation is permanent and cannot be undone.',
  deleteMemberSchema,
  async (rawInput) => {
    const validation = validateToolInput(deleteMemberSchema, rawInput, 'ghost_delete_member');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_delete_member for member ID: ${id}`);
    try {
      await loadServices();

      await ghostService.deleteMember(id);
      console.error(`Member deleted successfully. Member ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Member ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_member:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Member deletion');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error deleting member: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Members Tool
server.tool(
  'ghost_get_members',
  'Retrieves a list of members (subscribers) from Ghost CMS with optional filtering, pagination, and includes.',
  getMembersSchema,
  async (rawInput) => {
    const validation = validateToolInput(getMembersSchema, rawInput, 'ghost_get_members');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_members`);
    try {
      await loadServices();

      const options = {};
      if (input.limit !== undefined) options.limit = input.limit;
      if (input.page !== undefined) options.page = input.page;
      if (input.filter !== undefined) options.filter = input.filter;
      if (input.order !== undefined) options.order = input.order;
      if (input.include !== undefined) options.include = input.include;

      const members = await ghostService.getMembers(options);
      console.error(`Retrieved ${members.length} members from Ghost.`);

      return {
        content: [{ type: 'text', text: JSON.stringify(members, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_members:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Member query');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving members: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Member Tool
server.tool(
  'ghost_get_member',
  'Retrieves a single member from Ghost CMS by ID or email. Provide either id OR email.',
  getMemberSchema,
  async (rawInput) => {
    const validation = validateToolInput(getMemberSchema, rawInput, 'ghost_get_member');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id, email } = validation.data;

    console.error(`Executing tool: ghost_get_member for ${id ? `ID: ${id}` : `email: ${email}`}`);
    try {
      await loadServices();

      const member = await ghostService.getMember({ id, email });
      console.error(`Retrieved member: ${member.email} (ID: ${member.id})`);

      return {
        content: [{ type: 'text', text: JSON.stringify(member, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_member:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Member lookup');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving member: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Search Members Tool
server.tool(
  'ghost_search_members',
  'Searches for members by name or email in Ghost CMS.',
  searchMembersSchema,
  async (rawInput) => {
    const validation = validateToolInput(searchMembersSchema, rawInput, 'ghost_search_members');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { query, limit } = validation.data;

    console.error(`Executing tool: ghost_search_members with query: ${query}`);
    try {
      await loadServices();

      const options = {};
      if (limit !== undefined) options.limit = limit;

      const members = await ghostService.searchMembers(query, options);
      console.error(`Found ${members.length} members matching "${query}".`);

      return {
        content: [{ type: 'text', text: JSON.stringify(members, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_search_members:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Member search');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error searching members: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// NEWSLETTER TOOLS
// =============================================================================

// --- Newsletter Schema Definitions ---
const getNewsletterSchema = z.object({ id: ghostIdSchema });
const updateNewsletterInputSchema = z.object({ id: ghostIdSchema }).merge(updateNewsletterSchema);
const deleteNewsletterSchema = z.object({ id: ghostIdSchema });

// Get Newsletters Tool
server.tool(
  'ghost_get_newsletters',
  'Retrieves a list of newsletters from Ghost CMS with optional filtering.',
  newsletterQuerySchema,
  async (rawInput) => {
    const validation = validateToolInput(newsletterQuerySchema, rawInput, 'ghost_get_newsletters');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_newsletters`);
    try {
      await loadServices();

      const options = {};
      if (input.limit !== undefined) options.limit = input.limit;
      if (input.page !== undefined) options.page = input.page;
      if (input.filter !== undefined) options.filter = input.filter;
      if (input.order !== undefined) options.order = input.order;

      const newsletters = await ghostService.getNewsletters(options);
      console.error(`Retrieved ${newsletters.length} newsletters from Ghost.`);

      return {
        content: [{ type: 'text', text: JSON.stringify(newsletters, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_newsletters:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Newsletter query');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving newsletters: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Newsletter Tool
server.tool(
  'ghost_get_newsletter',
  'Retrieves a single newsletter from Ghost CMS by ID.',
  getNewsletterSchema,
  async (rawInput) => {
    const validation = validateToolInput(getNewsletterSchema, rawInput, 'ghost_get_newsletter');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_get_newsletter for ID: ${id}`);
    try {
      await loadServices();

      const newsletter = await ghostService.getNewsletter(id);
      console.error(`Retrieved newsletter: ${newsletter.name} (ID: ${newsletter.id})`);

      return {
        content: [{ type: 'text', text: JSON.stringify(newsletter, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_newsletter:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Newsletter retrieval');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error retrieving newsletter: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Create Newsletter Tool
server.tool(
  'ghost_create_newsletter',
  'Creates a new newsletter in Ghost CMS with customizable sender settings and display options.',
  createNewsletterSchema,
  async (rawInput) => {
    const validation = validateToolInput(
      createNewsletterSchema,
      rawInput,
      'ghost_create_newsletter'
    );
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_create_newsletter with name: ${input.name}`);
    try {
      await loadServices();

      const createdNewsletter = await newsletterService.createNewsletterService(input);
      console.error(`Newsletter created successfully. Newsletter ID: ${createdNewsletter.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdNewsletter, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_newsletter:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Newsletter creation');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error creating newsletter: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Update Newsletter Tool
server.tool(
  'ghost_update_newsletter',
  'Updates an existing newsletter in Ghost CMS. Can update name, description, sender settings, and display options.',
  updateNewsletterInputSchema,
  async (rawInput) => {
    const validation = validateToolInput(
      updateNewsletterInputSchema,
      rawInput,
      'ghost_update_newsletter'
    );
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_update_newsletter for newsletter ID: ${input.id}`);
    try {
      await loadServices();

      const { id, ...updateData } = input;

      const updatedNewsletter = await ghostService.updateNewsletter(id, updateData);
      console.error(`Newsletter updated successfully. Newsletter ID: ${updatedNewsletter.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedNewsletter, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_newsletter:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Newsletter update');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error updating newsletter: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Delete Newsletter Tool
server.tool(
  'ghost_delete_newsletter',
  'Deletes a newsletter from Ghost CMS by ID. This operation is permanent and cannot be undone.',
  deleteNewsletterSchema,
  async (rawInput) => {
    const validation = validateToolInput(
      deleteNewsletterSchema,
      rawInput,
      'ghost_delete_newsletter'
    );
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_delete_newsletter for newsletter ID: ${id}`);
    try {
      await loadServices();

      await ghostService.deleteNewsletter(id);
      console.error(`Newsletter deleted successfully. Newsletter ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Newsletter ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_newsletter:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Newsletter deletion');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error deleting newsletter: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tier Tools ---

// --- Tier Schema Definitions ---
const getTierSchema = z.object({ id: ghostIdSchema });
const updateTierInputSchema = z.object({ id: ghostIdSchema }).merge(updateTierSchema);
const deleteTierSchema = z.object({ id: ghostIdSchema });

// Get Tiers Tool
server.tool(
  'ghost_get_tiers',
  'Retrieves a list of tiers (membership levels) from Ghost CMS with optional filtering by type (free/paid).',
  tierQuerySchema,
  async (rawInput) => {
    const validation = validateToolInput(tierQuerySchema, rawInput, 'ghost_get_tiers');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_get_tiers`);
    try {
      await loadServices();

      const tiers = await ghostService.getTiers(input);
      console.error(`Retrieved ${tiers.length} tiers`);

      return {
        content: [{ type: 'text', text: JSON.stringify(tiers, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_tiers:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tier query');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error getting tiers: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Get Tier Tool
server.tool(
  'ghost_get_tier',
  'Retrieves a single tier (membership level) from Ghost CMS by ID.',
  getTierSchema,
  async (rawInput) => {
    const validation = validateToolInput(getTierSchema, rawInput, 'ghost_get_tier');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_get_tier for tier ID: ${id}`);
    try {
      await loadServices();

      const tier = await ghostService.getTier(id);
      console.error(`Tier retrieved successfully. Tier ID: ${tier.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(tier, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_tier:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tier retrieval');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error getting tier: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Create Tier Tool
server.tool(
  'ghost_create_tier',
  'Creates a new tier (membership level) in Ghost CMS with pricing and benefits.',
  createTierSchema,
  async (rawInput) => {
    const validation = validateToolInput(createTierSchema, rawInput, 'ghost_create_tier');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_create_tier`);
    try {
      await loadServices();

      const tier = await ghostService.createTier(input);
      console.error(`Tier created successfully. Tier ID: ${tier.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(tier, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_tier:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tier creation');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error creating tier: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Update Tier Tool
server.tool(
  'ghost_update_tier',
  'Updates an existing tier (membership level) in Ghost CMS. Can update pricing, benefits, and other tier properties.',
  updateTierInputSchema,
  async (rawInput) => {
    const validation = validateToolInput(updateTierInputSchema, rawInput, 'ghost_update_tier');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const input = validation.data;

    console.error(`Executing tool: ghost_update_tier for tier ID: ${input.id}`);
    try {
      await loadServices();

      const { id, ...updateData } = input;

      const updatedTier = await ghostService.updateTier(id, updateData);
      console.error(`Tier updated successfully. Tier ID: ${updatedTier.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedTier, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_tier:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tier update');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error updating tier: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Delete Tier Tool
server.tool(
  'ghost_delete_tier',
  'Deletes a tier (membership level) from Ghost CMS by ID. This operation is permanent and cannot be undone.',
  deleteTierSchema,
  async (rawInput) => {
    const validation = validateToolInput(deleteTierSchema, rawInput, 'ghost_delete_tier');
    if (!validation.success) {
      return validation.errorResponse;
    }
    const { id } = validation.data;

    console.error(`Executing tool: ghost_delete_tier for tier ID: ${id}`);
    try {
      await loadServices();

      await ghostService.deleteTier(id);
      console.error(`Tier deleted successfully. Tier ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Tier ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_tier:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, 'Tier deletion');
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error deleting tier: ${error.message}` }],
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
    'Available tools: ghost_get_tags, ghost_create_tag, ghost_get_tag, ghost_update_tag, ghost_delete_tag, ghost_upload_image, ' +
      'ghost_create_post, ghost_get_posts, ghost_get_post, ghost_search_posts, ghost_update_post, ghost_delete_post, ' +
      'ghost_get_pages, ghost_get_page, ghost_create_page, ghost_update_page, ghost_delete_page, ghost_search_pages, ' +
      'ghost_create_member, ghost_update_member, ghost_delete_member, ghost_get_members, ghost_get_member, ghost_search_members, ' +
      'ghost_get_newsletters, ghost_get_newsletter, ghost_create_newsletter, ghost_update_newsletter, ghost_delete_newsletter, ' +
      'ghost_get_tiers, ghost_get_tier, ghost_create_tier, ghost_update_tier, ghost_delete_tier'
  );
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
