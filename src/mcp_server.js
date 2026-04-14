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
dotenv.config({ quiet: true });

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

/**
 * Higher-order function that wraps a tool handler with standardized
 * input validation, service loading, and error handling.
 *
 * Note: Each registerTool call passes the schema twice — once as `inputSchema`
 * (MCP protocol metadata exposed to clients) and once here for runtime input
 * validation via validateToolInput. These serve different purposes and both
 * are required.
 *
 * @param {string} toolName - The tool identifier (e.g., 'ghost_get_tags')
 * @param {object} schema - Zod schema for input validation
 * @param {Function} handler - Async function receiving validated input, returns MCP response
 * @returns {Function} Wrapped async handler for server.registerTool
 */
const withErrorHandling = (toolName, schema, handler) => {
  const zodContext = toolName.replace('ghost_', '').replace(/_/g, ' ');
  return async (rawInput) => {
    console.error(`Executing tool: ${toolName}`);
    const validation = validateToolInput(schema, rawInput, toolName);
    if (!validation.success) {
      return validation.errorResponse;
    }

    try {
      await loadServices();
      return await handler(validation.data);
    } catch (error) {
      console.error(`Error in ${toolName}:`, error);
      if (error.name === 'ZodError') {
        const validationError = ValidationError.fromZod(error, zodContext);
        return {
          content: [{ type: 'text', text: JSON.stringify(validationError.toJSON(), null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error in ${toolName}: ${error.message}` }],
        isError: true,
      };
    }
  };
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
    id: ghostIdSchema.optional().meta({ description: 'The ID of the tag to retrieve.' }),
    slug: z.string().optional().meta({ description: 'The slug of the tag to retrieve.' }),
    include: z
      .string()
      .optional()
      .meta({ description: 'Additional resources to include (e.g., "count.posts").' }),
  })
  .refine((data) => data.id || data.slug, {
    message: 'Either id or slug is required to retrieve a tag',
  });
const updateTagInputSchema = updateTagSchema.extend({ id: ghostIdSchema });
const deleteTagSchema = z.object({ id: ghostIdSchema });

// Get Tags Tool
server.registerTool(
  'ghost_get_tags',
  {
    description:
      'Retrieves a list of tags from Ghost CMS with pagination, filtering, sorting, and relation inclusion. Supports filtering by name, slug, visibility, or custom NQL filter expressions.',
    inputSchema: getTagsSchema,
  },
  withErrorHandling('ghost_get_tags', getTagsSchema, async (input) => {
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

    return {
      content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }],
    };
  })
);

// Create Tag Tool
server.registerTool(
  'ghost_create_tag',
  {
    description: 'Creates a new tag in Ghost CMS.',
    inputSchema: createTagSchema,
  },
  withErrorHandling('ghost_create_tag', createTagSchema, async (input) => {
    const createdTag = await ghostService.createTag(input);
    console.error(`Tag created successfully. Tag ID: ${createdTag.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(createdTag, null, 2) }],
    };
  })
);

// Get Tag Tool
server.registerTool(
  'ghost_get_tag',
  {
    description: 'Retrieves a single tag from Ghost CMS by ID or slug.',
    inputSchema: getTagSchema,
  },
  withErrorHandling('ghost_get_tag', getTagSchema, async (input) => {
    const options = {};
    if (input.include !== undefined) options.include = input.include;

    if (!input.id && !input.slug) {
      throw new Error('Either id or slug is required');
    }
    const identifier = input.id || `slug/${input.slug}`;

    const tag = await ghostService.getTag(identifier, options);
    console.error(`Retrieved tag: ${tag.name} (ID: ${tag.id})`);

    return {
      content: [{ type: 'text', text: JSON.stringify(tag, null, 2) }],
    };
  })
);

// Update Tag Tool
server.registerTool(
  'ghost_update_tag',
  {
    description: 'Updates an existing tag in Ghost CMS.',
    inputSchema: updateTagInputSchema,
  },
  withErrorHandling('ghost_update_tag', updateTagInputSchema, async (input) => {
    const { id, ...updateData } = input;
    const updatedTag = await ghostService.updateTag(id, updateData);
    console.error(`Tag updated successfully. Tag ID: ${updatedTag.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(updatedTag, null, 2) }],
    };
  })
);

// Delete Tag Tool
server.registerTool(
  'ghost_delete_tag',
  {
    description:
      'Deletes a tag from Ghost CMS by ID. This operation is permanent and cannot be undone.',
    inputSchema: deleteTagSchema,
  },
  withErrorHandling('ghost_delete_tag', deleteTagSchema, async (input) => {
    const { id } = input;
    await ghostService.deleteTag(id);
    console.error(`Tag deleted successfully. Tag ID: ${id}`);

    return {
      content: [{ type: 'text', text: `Tag ${id} has been successfully deleted.` }],
    };
  })
);

// --- Image Schema ---
// Base object (plain ZodObject — keeps `.shape` available for MCP schema
// introspection). Runtime XOR validation is applied at the tool level
// via a manual check so we never wrap with ZodEffects.
const imageInputFields = {
  imageUrl: z.string().optional().meta({
    description: 'The publicly accessible URL of the image to download and upload.',
  }),
  imagePath: z.string().optional().meta({
    description:
      'Absolute path to a local image file. Only accepted when the GHOST_MCP_IMAGE_ROOT env var is set; paths must resolve inside that root.',
  }),
  imageBase64: z.string().optional().meta({
    description:
      'Base64-encoded image bytes (with or without data: URI prefix). Decoded size capped at 5MB to respect MCP transport limits. Requires mimeType.',
  }),
  mimeType: z.string().optional().meta({
    description:
      'MIME type for imageBase64 input (e.g. image/png, image/jpeg, image/svg+xml). Required when imageBase64 is used.',
  }),
  alt: z.string().optional().meta({
    description:
      'Alt text for the image. If omitted, a default will be generated from the filename.',
  }),
  purpose: z.enum(['image', 'profile_image', 'icon']).optional().meta({
    description:
      'Intended use. Ghost validates format/size per purpose (icon/profile_image must be square; icon also accepts ICO).',
  }),
  ref: z.string().max(200).optional().meta({
    description:
      'Caller-supplied identifier (e.g. original filename). Ghost echoes it back in the response.',
  }),
};

const uploadImageSchema = z.object(imageInputFields);

function validateImageInputXor(data) {
  const count = Number(!!data.imageUrl) + Number(!!data.imagePath) + Number(!!data.imageBase64);
  if (count !== 1) return 'Provide exactly one of imageUrl, imagePath, or imageBase64.';
  if (data.imageBase64 && !data.mimeType) {
    return 'mimeType is required when imageBase64 is provided.';
  }
  return null;
}

async function acquireImageForUpload({ imageUrl, imagePath: localPath, imageBase64, mimeType }) {
  const tempDir = os.tmpdir();

  if (imageUrl) {
    const urlValidation = urlValidator.validateImageUrl(imageUrl);
    if (!urlValidation.isValid) {
      throw new Error(`Invalid image URL: ${urlValidation.error}`);
    }
    const axiosConfig = urlValidator.createSecureAxiosConfig(urlValidation.sanitizedUrl);
    const response = await axios(axiosConfig);
    const extension = path.extname(imageUrl.split('?')[0]) || '.tmp';
    const filenameHint =
      path.basename(imageUrl.split('?')[0]) || `image-${generateUuid()}${extension}`;
    const downloadedPath = path.join(tempDir, `mcp-download-${generateUuid()}${extension}`);
    const writer = fs.createWriteStream(downloadedPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    return { acquiredPath: downloadedPath, filenameHint, source: 'url' };
  }

  if (localPath) {
    const { resolveLocalImagePath } = await import('./utils/imageInputResolver.js');
    const resolved = await resolveLocalImagePath(localPath);
    return { acquiredPath: resolved, filenameHint: path.basename(resolved), source: 'path' };
  }

  if (imageBase64) {
    const { decodeBase64ToTempFile } = await import('./utils/imageInputResolver.js');
    const decodedPath = await decodeBase64ToTempFile(imageBase64, mimeType);
    return {
      acquiredPath: decodedPath,
      filenameHint: path.basename(decodedPath),
      source: 'base64',
    };
  }

  throw new Error('No image input provided'); // unreachable — schema enforces one
}

/**
 * Acquire → process → upload an image from a validated input. Owns its
 * own temp-file lifecycle. Returns { uploadResult, filenameHint, finalAltText }.
 * Does NOT delete the caller's imagePath file.
 */
async function performImageUpload(data) {
  await loadServices();

  let acquiredPath = null;
  let processedPath = null;

  try {
    const acquired = await acquireImageForUpload(data);
    acquiredPath = acquired.acquiredPath;
    if (acquired.source !== 'path') trackTempFile(acquiredPath);

    processedPath = await imageProcessingService.processImage(
      acquiredPath,
      os.tmpdir(),
      data.purpose ? { purpose: data.purpose } : {}
    );
    if (processedPath !== acquiredPath) trackTempFile(processedPath);

    const uploadOpts = {};
    if (data.purpose) uploadOpts.purpose = data.purpose;
    if (data.ref) uploadOpts.ref = data.ref;
    else if (acquired.filenameHint) uploadOpts.ref = acquired.filenameHint.slice(0, 200);

    const uploadResult = await ghostService.uploadImage(processedPath, uploadOpts);
    const finalAltText = data.alt || getDefaultAltText(acquired.filenameHint);

    return { uploadResult, filenameHint: acquired.filenameHint, finalAltText };
  } finally {
    const toClean = [processedPath];
    if (acquiredPath && !data.imagePath) toClean.unshift(acquiredPath);
    await cleanupTempFiles(toClean, console);
  }
}

// Upload Image Tool
server.registerTool(
  'ghost_upload_image',
  {
    description:
      'Uploads an image to Ghost CMS. Accepts a remote URL, a local file path (when GHOST_MCP_IMAGE_ROOT is configured), or a base64 payload. Returns the Ghost image URL, alt text, and ref (when Ghost echoes it).',
    inputSchema: uploadImageSchema,
  },
  async (rawInput) => {
    const validation = validateToolInput(uploadImageSchema, rawInput, 'ghost_upload_image');
    if (!validation.success) return validation.errorResponse;
    const xorError = validateImageInputXor(validation.data);
    if (xorError) {
      return { content: [{ type: 'text', text: xorError }], isError: true };
    }

    try {
      const { uploadResult, finalAltText } = await performImageUpload(validation.data);
      const result = { url: uploadResult.url, alt: finalAltText };
      if (uploadResult.ref) result.ref = uploadResult.ref;
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      console.error(`Error in ghost_upload_image:`, error);
      return {
        content: [{ type: 'text', text: `Error uploading image: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// --- Set Feature Image Tool ---
// Combined upload-and-assign flow. Ghost has no delete-image endpoint,
// so when the post/page update fails after a successful upload, the
// image is orphaned in Ghost's storage — we surface its URL in the
// error response so the caller can reuse or record it.
const setFeatureImageSchema = z.object({
  ...imageInputFields,
  type: z.enum(['post', 'page']).meta({
    description: 'Which resource to attach the feature image to.',
  }),
  id: ghostIdSchema.meta({ description: 'ID of the post or page.' }),
  caption: z.string().max(5000).optional().meta({
    description: 'Optional HTML caption for the feature image (max 5000 chars).',
  }),
});

server.registerTool(
  'ghost_set_feature_image',
  {
    description:
      'Uploads an image and assigns it as the feature image of a post or page (with optional alt text and caption) in one call. Accepts the same imageUrl/imagePath/imageBase64 input modes as ghost_upload_image. Returns the updated resource. If the update fails after the upload, the error response includes the orphaned image URL.',
    inputSchema: setFeatureImageSchema,
  },
  async (rawInput) => {
    const validation = validateToolInput(
      setFeatureImageSchema,
      rawInput,
      'ghost_set_feature_image'
    );
    if (!validation.success) return validation.errorResponse;
    const xorError = validateImageInputXor(validation.data);
    if (xorError) {
      return { content: [{ type: 'text', text: xorError }], isError: true };
    }

    const { type, id, caption } = validation.data;

    let uploadedUrl;
    let uploadedRef;
    let altText;
    try {
      const { uploadResult, finalAltText } = await performImageUpload(validation.data);
      uploadedUrl = uploadResult.url;
      uploadedRef = uploadResult.ref;
      altText = finalAltText;
    } catch (error) {
      console.error(`ghost_set_feature_image: upload failed`, error);
      return {
        content: [{ type: 'text', text: `Upload failed: ${error.message}` }],
        isError: true,
      };
    }

    const updatePayload = {
      feature_image: uploadedUrl,
      feature_image_alt: altText,
    };
    if (caption !== undefined) updatePayload.feature_image_caption = caption;

    try {
      const updated =
        type === 'post'
          ? await ghostService.updatePost(id, updatePayload)
          : await ghostService.updatePage(id, updatePayload);
      console.error(`ghost_set_feature_image: ${type} ${id} updated with ${uploadedUrl}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { uploaded: { url: uploadedUrl, ref: uploadedRef, alt: altText }, [type]: updated },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`ghost_set_feature_image: update failed (orphaned ${uploadedUrl})`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: `Upload succeeded but ${type} update failed: ${error.message}`,
                orphanedImage: { url: uploadedUrl, ref: uploadedRef, alt: altText },
                hint: 'Ghost does not expose a delete-image endpoint; reuse this URL or leave it orphaned.',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Post Schema Definitions ---
const getPostsSchema = postQuerySchema.extend({
  status: z
    .enum(['published', 'draft', 'scheduled', 'all'])
    .optional()
    .meta({ description: 'Filter posts by status. Options: published, draft, scheduled, all.' }),
});
const getPostSchema = z
  .object({
    id: ghostIdSchema.optional().meta({ description: 'The ID of the post to retrieve.' }),
    slug: z.string().optional().meta({ description: 'The slug of the post to retrieve.' }),
    include: z.string().optional().meta({
      description: 'Comma-separated list of relations to include (e.g., "tags,authors").',
    }),
  })
  .refine((data) => data.id || data.slug, {
    message: 'Either id or slug is required to retrieve a post',
  });
const searchPostsSchema = z.object({
  query: z.string().min(1).meta({ description: 'Search query to find in post titles.' }),
  status: z
    .enum(['published', 'draft', 'scheduled', 'all'])
    .optional()
    .meta({ description: 'Filter by post status. Default searches all statuses.' }),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .meta({ description: 'Maximum number of results (1-50). Default is 15.' }),
});
const updatePostInputSchema = updatePostSchema.extend({ id: ghostIdSchema });
const deletePostSchema = z.object({ id: ghostIdSchema });

// Create Post Tool
server.registerTool(
  'ghost_create_post',
  {
    description: 'Creates a new post in Ghost CMS.',
    inputSchema: createPostSchema,
  },
  withErrorHandling('ghost_create_post', createPostSchema, async (input) => {
    const createdPost = await postService.createPostService(input);
    console.error(`Post created successfully. Post ID: ${createdPost.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(createdPost, null, 2) }],
    };
  })
);

// Get Posts Tool
server.registerTool(
  'ghost_get_posts',
  {
    description:
      'Retrieves a list of posts from Ghost CMS with pagination, filtering, and sorting options.',
    inputSchema: getPostsSchema,
  },
  withErrorHandling('ghost_get_posts', getPostsSchema, async (input) => {
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
  })
);

// Get Post Tool
server.registerTool(
  'ghost_get_post',
  {
    description: 'Retrieves a single post from Ghost CMS by ID or slug.',
    inputSchema: getPostSchema,
  },
  withErrorHandling('ghost_get_post', getPostSchema, async (input) => {
    // Build options object
    const options = {};
    if (input.include !== undefined) options.include = input.include;

    // Determine identifier (prefer ID over slug)
    if (!input.id && !input.slug) {
      throw new Error('Either id or slug is required');
    }
    const identifier = input.id || `slug/${input.slug}`;

    const post = await ghostService.getPost(identifier, options);
    console.error(`Retrieved post: ${post.title} (ID: ${post.id})`);

    return {
      content: [{ type: 'text', text: JSON.stringify(post, null, 2) }],
    };
  })
);

// Search Posts Tool
server.registerTool(
  'ghost_search_posts',
  {
    description: 'Search for posts in Ghost CMS by query string with optional status filtering.',
    inputSchema: searchPostsSchema,
  },
  withErrorHandling('ghost_search_posts', searchPostsSchema, async (input) => {
    // Build options object with provided parameters
    const options = {};
    if (input.status !== undefined) options.status = input.status;
    if (input.limit !== undefined) options.limit = input.limit;

    const posts = await ghostService.searchPosts(input.query, options);
    console.error(`Found ${posts.length} posts matching "${input.query}".`);

    return {
      content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }],
    };
  })
);

// Update Post Tool
server.registerTool(
  'ghost_update_post',
  {
    description:
      'Updates an existing post in Ghost CMS. Can update title, content, status, tags, images, and SEO fields. Only the provided fields are changed; omitted fields remain unchanged. Note: tags and authors arrays are fully replaced, not merged with existing values.',
    inputSchema: updatePostInputSchema,
  },
  withErrorHandling('ghost_update_post', updatePostInputSchema, async (input) => {
    // Extract ID from input and build update data
    const { id, ...updateData } = input;

    const updatedPost = await ghostService.updatePost(id, updateData);
    console.error(`Post updated successfully. Post ID: ${updatedPost.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(updatedPost, null, 2) }],
    };
  })
);

// Delete Post Tool
server.registerTool(
  'ghost_delete_post',
  {
    description:
      'Deletes a post from Ghost CMS by ID. This operation is permanent and cannot be undone.',
    inputSchema: deletePostSchema,
  },
  withErrorHandling('ghost_delete_post', deletePostSchema, async (input) => {
    const { id } = input;
    await ghostService.deletePost(id);
    console.error(`Post deleted successfully. Post ID: ${id}`);

    return {
      content: [{ type: 'text', text: `Post ${id} has been successfully deleted.` }],
    };
  })
);

// =============================================================================
// PAGE TOOLS
// Pages are similar to posts but do NOT support tags
// =============================================================================

// --- Page Schema Definitions ---
const getPageSchema = z
  .object({
    id: ghostIdSchema.optional().meta({ description: 'The ID of the page to retrieve.' }),
    slug: z.string().optional().meta({ description: 'The slug of the page to retrieve.' }),
    include: z
      .string()
      .optional()
      .meta({ description: 'Comma-separated list of relations to include (e.g., "authors").' }),
  })
  .refine((data) => data.id || data.slug, {
    message: 'Either id or slug is required to retrieve a page',
  });
const updatePageInputSchema = z
  .object({ id: ghostIdSchema.meta({ description: 'The ID of the page to update.' }) })
  .merge(updatePageSchema);
const deletePageSchema = z.object({
  id: ghostIdSchema.meta({ description: 'The ID of the page to delete.' }),
});
const searchPagesSchema = z.object({
  query: z
    .string()
    .min(1, 'Search query cannot be empty')
    .meta({ description: 'Search query to find in page titles.' }),
  status: z
    .enum(['published', 'draft', 'scheduled', 'all'])
    .optional()
    .meta({ description: 'Filter by page status. Default searches all statuses.' }),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(15)
    .optional()
    .meta({ description: 'Maximum number of results (1-50). Default is 15.' }),
});

// Get Pages Tool
server.registerTool(
  'ghost_get_pages',
  {
    description:
      'Retrieves a list of pages from Ghost CMS with pagination, filtering, and sorting options.',
    inputSchema: pageQuerySchema,
  },
  withErrorHandling('ghost_get_pages', pageQuerySchema, async (input) => {
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
  })
);

// Get Page Tool
server.registerTool(
  'ghost_get_page',
  {
    description: 'Retrieves a single page from Ghost CMS by ID or slug.',
    inputSchema: getPageSchema,
  },
  withErrorHandling('ghost_get_page', getPageSchema, async (input) => {
    const options = {};
    if (input.include !== undefined) options.include = input.include;

    if (!input.id && !input.slug) {
      throw new Error('Either id or slug is required');
    }
    const identifier = input.id || `slug/${input.slug}`;

    const page = await ghostService.getPage(identifier, options);
    console.error(`Retrieved page: ${page.title} (ID: ${page.id})`);

    return {
      content: [{ type: 'text', text: JSON.stringify(page, null, 2) }],
    };
  })
);

// Create Page Tool
server.registerTool(
  'ghost_create_page',
  {
    description:
      'Creates a new page in Ghost CMS. Note: Pages do NOT typically use tags (unlike posts).',
    inputSchema: createPageSchema,
  },
  withErrorHandling('ghost_create_page', createPageSchema, async (input) => {
    const createdPage = await pageService.createPageService(input);
    console.error(`Page created successfully. Page ID: ${createdPage.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(createdPage, null, 2) }],
    };
  })
);

// Update Page Tool
server.registerTool(
  'ghost_update_page',
  {
    description:
      'Updates an existing page in Ghost CMS. Can update title, content, status, images, and SEO fields. Only the provided fields are changed; omitted fields remain unchanged.',
    inputSchema: updatePageInputSchema,
  },
  withErrorHandling('ghost_update_page', updatePageInputSchema, async (input) => {
    const { id, ...updateData } = input;

    const updatedPage = await ghostService.updatePage(id, updateData);
    console.error(`Page updated successfully. Page ID: ${updatedPage.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(updatedPage, null, 2) }],
    };
  })
);

// Delete Page Tool
server.registerTool(
  'ghost_delete_page',
  {
    description:
      'Deletes a page from Ghost CMS by ID. This operation is permanent and cannot be undone.',
    inputSchema: deletePageSchema,
  },
  withErrorHandling('ghost_delete_page', deletePageSchema, async (input) => {
    const { id } = input;
    await ghostService.deletePage(id);
    console.error(`Page deleted successfully. Page ID: ${id}`);

    return {
      content: [{ type: 'text', text: `Page ${id} has been successfully deleted.` }],
    };
  })
);

// Search Pages Tool
server.registerTool(
  'ghost_search_pages',
  {
    description: 'Search for pages in Ghost CMS by query string with optional status filtering.',
    inputSchema: searchPagesSchema,
  },
  withErrorHandling('ghost_search_pages', searchPagesSchema, async (input) => {
    const options = {};
    if (input.status !== undefined) options.status = input.status;
    if (input.limit !== undefined) options.limit = input.limit;

    const pages = await ghostService.searchPages(input.query, options);
    console.error(`Found ${pages.length} pages matching "${input.query}".`);

    return {
      content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }],
    };
  })
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
    id: ghostIdSchema.optional().meta({ description: 'The ID of the member to retrieve.' }),
    email: emailSchema.optional().meta({ description: 'The email of the member to retrieve.' }),
  })
  .refine((data) => data.id || data.email, {
    message: 'Either id or email must be provided',
  });
const searchMembersSchema = z.object({
  query: z
    .string()
    .min(1)
    .meta({ description: 'Search query to match against member name or email.' }),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .meta({ description: 'Maximum number of results to return (1-50). Default is 15.' }),
});

// Create Member Tool
server.registerTool(
  'ghost_create_member',
  {
    description: 'Creates a new member (subscriber) in Ghost CMS.',
    inputSchema: createMemberSchema,
  },
  withErrorHandling('ghost_create_member', createMemberSchema, async (input) => {
    const createdMember = await ghostService.createMember(input);
    console.error(`Member created successfully. Member ID: ${createdMember.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(createdMember, null, 2) }],
    };
  })
);

// Update Member Tool
server.registerTool(
  'ghost_update_member',
  {
    description: 'Updates an existing member in Ghost CMS. All fields except id are optional.',
    inputSchema: updateMemberInputSchema,
  },
  withErrorHandling('ghost_update_member', updateMemberInputSchema, async (input) => {
    const { id, ...updateData } = input;

    const updatedMember = await ghostService.updateMember(id, updateData);
    console.error(`Member updated successfully. Member ID: ${updatedMember.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(updatedMember, null, 2) }],
    };
  })
);

// Delete Member Tool
server.registerTool(
  'ghost_delete_member',
  {
    description:
      'Deletes a member from Ghost CMS by ID. This operation is permanent and cannot be undone.',
    inputSchema: deleteMemberSchema,
  },
  withErrorHandling('ghost_delete_member', deleteMemberSchema, async (input) => {
    const { id } = input;
    await ghostService.deleteMember(id);
    console.error(`Member deleted successfully. Member ID: ${id}`);

    return {
      content: [{ type: 'text', text: `Member ${id} has been successfully deleted.` }],
    };
  })
);

// Get Members Tool
server.registerTool(
  'ghost_get_members',
  {
    description:
      'Retrieves a list of members (subscribers) from Ghost CMS with optional filtering, pagination, and includes.',
    inputSchema: getMembersSchema,
  },
  withErrorHandling('ghost_get_members', getMembersSchema, async (input) => {
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
  })
);

// Get Member Tool
server.registerTool(
  'ghost_get_member',
  {
    description:
      'Retrieves a single member from Ghost CMS by ID or email. Provide either id OR email.',
    inputSchema: getMemberSchema,
  },
  withErrorHandling('ghost_get_member', getMemberSchema, async (input) => {
    const { id, email } = input;
    const member = await ghostService.getMember({ id, email });
    console.error(`Retrieved member: ${member.email} (ID: ${member.id})`);

    return {
      content: [{ type: 'text', text: JSON.stringify(member, null, 2) }],
    };
  })
);

// Search Members Tool
server.registerTool(
  'ghost_search_members',
  {
    description: 'Searches for members by name or email in Ghost CMS.',
    inputSchema: searchMembersSchema,
  },
  withErrorHandling('ghost_search_members', searchMembersSchema, async (input) => {
    const { query, limit } = input;
    const options = {};
    if (limit !== undefined) options.limit = limit;

    const members = await ghostService.searchMembers(query, options);
    console.error(`Found ${members.length} members matching "${query}".`);

    return {
      content: [{ type: 'text', text: JSON.stringify(members, null, 2) }],
    };
  })
);

// =============================================================================
// NEWSLETTER TOOLS
// =============================================================================

// --- Newsletter Schema Definitions ---
const getNewsletterSchema = z.object({ id: ghostIdSchema });
const updateNewsletterInputSchema = z.object({ id: ghostIdSchema }).merge(updateNewsletterSchema);
const deleteNewsletterSchema = z.object({ id: ghostIdSchema });

// Get Newsletters Tool
server.registerTool(
  'ghost_get_newsletters',
  {
    description: 'Retrieves a list of newsletters from Ghost CMS with optional filtering.',
    inputSchema: newsletterQuerySchema,
  },
  withErrorHandling('ghost_get_newsletters', newsletterQuerySchema, async (input) => {
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
  })
);

// Get Newsletter Tool
server.registerTool(
  'ghost_get_newsletter',
  {
    description: 'Retrieves a single newsletter from Ghost CMS by ID.',
    inputSchema: getNewsletterSchema,
  },
  withErrorHandling('ghost_get_newsletter', getNewsletterSchema, async (input) => {
    const { id } = input;
    const newsletter = await ghostService.getNewsletter(id);
    console.error(`Retrieved newsletter: ${newsletter.name} (ID: ${newsletter.id})`);

    return {
      content: [{ type: 'text', text: JSON.stringify(newsletter, null, 2) }],
    };
  })
);

// Create Newsletter Tool
server.registerTool(
  'ghost_create_newsletter',
  {
    description:
      'Creates a new newsletter in Ghost CMS with customizable sender settings and display options.',
    inputSchema: createNewsletterSchema,
  },
  withErrorHandling('ghost_create_newsletter', createNewsletterSchema, async (input) => {
    const createdNewsletter = await newsletterService.createNewsletterService(input);
    console.error(`Newsletter created successfully. Newsletter ID: ${createdNewsletter.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(createdNewsletter, null, 2) }],
    };
  })
);

// Update Newsletter Tool
server.registerTool(
  'ghost_update_newsletter',
  {
    description:
      'Updates an existing newsletter in Ghost CMS. Can update name, description, sender settings, and display options.',
    inputSchema: updateNewsletterInputSchema,
  },
  withErrorHandling('ghost_update_newsletter', updateNewsletterInputSchema, async (input) => {
    const { id, ...updateData } = input;

    const updatedNewsletter = await ghostService.updateNewsletter(id, updateData);
    console.error(`Newsletter updated successfully. Newsletter ID: ${updatedNewsletter.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(updatedNewsletter, null, 2) }],
    };
  })
);

// Delete Newsletter Tool
server.registerTool(
  'ghost_delete_newsletter',
  {
    description:
      'Deletes a newsletter from Ghost CMS by ID. This operation is permanent and cannot be undone.',
    inputSchema: deleteNewsletterSchema,
  },
  withErrorHandling('ghost_delete_newsletter', deleteNewsletterSchema, async (input) => {
    const { id } = input;
    await ghostService.deleteNewsletter(id);
    console.error(`Newsletter deleted successfully. Newsletter ID: ${id}`);

    return {
      content: [{ type: 'text', text: `Newsletter ${id} has been successfully deleted.` }],
    };
  })
);

// --- Tier Tools ---

// --- Tier Schema Definitions ---
const getTierSchema = z.object({ id: ghostIdSchema });
const updateTierInputSchema = z.object({ id: ghostIdSchema }).merge(updateTierSchema);
const deleteTierSchema = z.object({ id: ghostIdSchema });

// Get Tiers Tool
server.registerTool(
  'ghost_get_tiers',
  {
    description:
      'Retrieves a list of tiers (membership levels) from Ghost CMS with optional filtering by type (free/paid).',
    inputSchema: tierQuerySchema,
  },
  withErrorHandling('ghost_get_tiers', tierQuerySchema, async (input) => {
    const tiers = await ghostService.getTiers(input);
    console.error(`Retrieved ${tiers.length} tiers`);

    return {
      content: [{ type: 'text', text: JSON.stringify(tiers, null, 2) }],
    };
  })
);

// Get Tier Tool
server.registerTool(
  'ghost_get_tier',
  {
    description: 'Retrieves a single tier (membership level) from Ghost CMS by ID.',
    inputSchema: getTierSchema,
  },
  withErrorHandling('ghost_get_tier', getTierSchema, async (input) => {
    const { id } = input;
    const tier = await ghostService.getTier(id);
    console.error(`Tier retrieved successfully. Tier ID: ${tier.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(tier, null, 2) }],
    };
  })
);

// Create Tier Tool
server.registerTool(
  'ghost_create_tier',
  {
    description: 'Creates a new tier (membership level) in Ghost CMS with pricing and benefits.',
    inputSchema: createTierSchema,
  },
  withErrorHandling('ghost_create_tier', createTierSchema, async (input) => {
    const tier = await ghostService.createTier(input);
    console.error(`Tier created successfully. Tier ID: ${tier.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(tier, null, 2) }],
    };
  })
);

// Update Tier Tool
server.registerTool(
  'ghost_update_tier',
  {
    description:
      'Updates an existing tier (membership level) in Ghost CMS. Can update pricing, benefits, and other tier properties.',
    inputSchema: updateTierInputSchema,
  },
  withErrorHandling('ghost_update_tier', updateTierInputSchema, async (input) => {
    const { id, ...updateData } = input;

    const updatedTier = await ghostService.updateTier(id, updateData);
    console.error(`Tier updated successfully. Tier ID: ${updatedTier.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(updatedTier, null, 2) }],
    };
  })
);

// Delete Tier Tool
server.registerTool(
  'ghost_delete_tier',
  {
    description:
      'Deletes a tier (membership level) from Ghost CMS by ID. This operation is permanent and cannot be undone.',
    inputSchema: deleteTierSchema,
  },
  withErrorHandling('ghost_delete_tier', deleteTierSchema, async (input) => {
    const { id } = input;
    await ghostService.deleteTier(id);
    console.error(`Tier deleted successfully. Tier ID: ${id}`);

    return {
      content: [{ type: 'text', text: `Tier ${id} has been successfully deleted.` }],
    };
  })
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
