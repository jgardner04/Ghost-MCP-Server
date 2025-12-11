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

// Get Posts Tool
server.tool(
  'ghost_get_posts',
  'Retrieves a list of posts from Ghost CMS with pagination, filtering, and sorting options.',
  {
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of posts to retrieve (1-100). Default is 15.'),
    page: z.number().min(1).optional().describe('Page number for pagination. Default is 1.'),
    status: z
      .enum(['published', 'draft', 'scheduled', 'all'])
      .optional()
      .describe('Filter posts by status. Options: published, draft, scheduled, all.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated list of relations to include (e.g., "tags,authors").'),
    filter: z
      .string()
      .optional()
      .describe('Ghost NQL filter string for advanced filtering (e.g., "featured:true").'),
    order: z
      .string()
      .optional()
      .describe('Sort order for results (e.g., "published_at DESC", "title ASC").'),
  },
  async (input) => {
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

      const posts = await ghostService.getPosts(options);
      console.error(`Retrieved ${posts.length} posts from Ghost.`);

      return {
        content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_posts:`, error);
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
  {
    id: z.string().optional().describe('The ID of the post to retrieve.'),
    slug: z.string().optional().describe('The slug of the post to retrieve.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated list of relations to include (e.g., "tags,authors").'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_get_post`);
    try {
      // Validate that at least one of id or slug is provided
      if (!input.id && !input.slug) {
        throw new Error('Either id or slug is required to retrieve a post');
      }

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
  {
    query: z.string().describe('Search query to find in post titles.'),
    status: z
      .enum(['published', 'draft', 'scheduled', 'all'])
      .optional()
      .describe('Filter by post status. Default searches all statuses.'),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results (1-50). Default is 15.'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_search_posts with query: ${input.query}`);
    try {
      await loadServices();

      // Build options object with provided parameters
      const options = {};
      if (input.status !== undefined) options.status = input.status;
      if (input.limit !== undefined) options.limit = input.limit;

      // Search posts using ghostServiceImproved
      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const posts = await ghostServiceImproved.searchPosts(input.query, options);
      console.error(`Found ${posts.length} posts matching "${input.query}".`);

      return {
        content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_search_posts:`, error);
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
  {
    id: z.string().describe('The ID of the post to update.'),
    title: z.string().optional().describe('New title for the post.'),
    html: z.string().optional().describe('New HTML content for the post.'),
    status: z
      .enum(['draft', 'published', 'scheduled'])
      .optional()
      .describe('New status for the post.'),
    tags: z
      .array(z.string())
      .optional()
      .describe('New list of tag names to associate with the post.'),
    feature_image: z.string().optional().describe('New featured image URL.'),
    feature_image_alt: z.string().optional().describe('New alt text for the featured image.'),
    feature_image_caption: z.string().optional().describe('New caption for the featured image.'),
    meta_title: z.string().optional().describe('New custom title for SEO (max 300 chars).'),
    meta_description: z
      .string()
      .optional()
      .describe('New custom description for SEO (max 500 chars).'),
    published_at: z
      .string()
      .optional()
      .describe(
        "New publication date/time in ISO 8601 format. Required if changing status to 'scheduled'."
      ),
    custom_excerpt: z.string().optional().describe('New custom short summary for the post.'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_update_post for post ID: ${input.id}`);
    try {
      await loadServices();

      // Extract ID from input and build update data
      const { id, ...updateData } = input;

      // Update the post using ghostServiceImproved
      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const updatedPost = await ghostServiceImproved.updatePost(id, updateData);
      console.error(`Post updated successfully. Post ID: ${updatedPost.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedPost, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_post:`, error);
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
  {
    id: z.string().describe('The ID of the post to delete.'),
  },
  async ({ id }) => {
    console.error(`Executing tool: ghost_delete_post for post ID: ${id}`);
    try {
      await loadServices();

      // Delete the post using ghostServiceImproved
      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      await ghostServiceImproved.deletePost(id);
      console.error(`Post deleted successfully. Post ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Post ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_post:`, error);
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

// Get Pages Tool
server.tool(
  'ghost_get_pages',
  'Retrieves a list of pages from Ghost CMS with pagination, filtering, and sorting options.',
  {
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of pages to retrieve (1-100). Default is 15.'),
    page: z.number().min(1).optional().describe('Page number for pagination. Default is 1.'),
    status: z
      .enum(['published', 'draft', 'scheduled', 'all'])
      .optional()
      .describe('Filter pages by status.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated list of relations to include (e.g., "authors").'),
    filter: z.string().optional().describe('Ghost NQL filter string for advanced filtering.'),
    order: z.string().optional().describe('Sort order for results (e.g., "published_at DESC").'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_get_pages`);
    try {
      await loadServices();

      const options = {};
      if (input.limit !== undefined) options.limit = input.limit;
      if (input.page !== undefined) options.page = input.page;
      if (input.status !== undefined) options.status = input.status;
      if (input.include !== undefined) options.include = input.include;
      if (input.filter !== undefined) options.filter = input.filter;
      if (input.order !== undefined) options.order = input.order;

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const pages = await ghostServiceImproved.getPages(options);
      console.error(`Retrieved ${pages.length} pages from Ghost.`);

      return {
        content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_pages:`, error);
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
  {
    id: z.string().optional().describe('The ID of the page to retrieve.'),
    slug: z.string().optional().describe('The slug of the page to retrieve.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated list of relations to include (e.g., "authors").'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_get_page`);
    try {
      if (!input.id && !input.slug) {
        throw new Error('Either id or slug is required to retrieve a page');
      }

      await loadServices();

      const options = {};
      if (input.include !== undefined) options.include = input.include;

      const identifier = input.id || `slug/${input.slug}`;

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const page = await ghostServiceImproved.getPage(identifier, options);
      console.error(`Retrieved page: ${page.title} (ID: ${page.id})`);

      return {
        content: [{ type: 'text', text: JSON.stringify(page, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_get_page:`, error);
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
  'Creates a new page in Ghost CMS. Note: Pages do NOT support tags (unlike posts).',
  {
    title: z.string().describe('The title of the page.'),
    html: z.string().describe('The HTML content of the page.'),
    status: z
      .enum(['draft', 'published', 'scheduled'])
      .optional()
      .describe("The status of the page. Defaults to 'draft'."),
    // NO tags parameter - pages don't support tags
    published_at: z
      .string()
      .optional()
      .describe("ISO 8601 date/time to publish the page. Required if status is 'scheduled'."),
    custom_excerpt: z.string().optional().describe('A custom short summary for the page.'),
    feature_image: z.string().optional().describe('URL of the image to use as the featured image.'),
    feature_image_alt: z.string().optional().describe('Alt text for the featured image.'),
    feature_image_caption: z.string().optional().describe('Caption for the featured image.'),
    meta_title: z
      .string()
      .optional()
      .describe('Custom title for SEO (max 70 chars). Defaults to page title if omitted.'),
    meta_description: z
      .string()
      .optional()
      .describe(
        'Custom description for SEO (max 160 chars). Defaults to excerpt or generated summary if omitted.'
      ),
  },
  async (input) => {
    console.error(`Executing tool: ghost_create_page with title: ${input.title}`);
    try {
      await loadServices();

      const pageService = await import('./services/pageService.js');
      const createdPage = await pageService.createPageService(input);
      console.error(`Page created successfully. Page ID: ${createdPage.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdPage, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_page:`, error);
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
  'Updates an existing page in Ghost CMS. Can update title, content, status, images, and SEO fields. Note: Pages do NOT support tags.',
  {
    id: z.string().describe('The ID of the page to update.'),
    title: z.string().optional().describe('New title for the page.'),
    html: z.string().optional().describe('New HTML content for the page.'),
    status: z
      .enum(['draft', 'published', 'scheduled'])
      .optional()
      .describe('New status for the page.'),
    // NO tags parameter - pages don't support tags
    feature_image: z.string().optional().describe('New featured image URL.'),
    feature_image_alt: z.string().optional().describe('New alt text for the featured image.'),
    feature_image_caption: z.string().optional().describe('New caption for the featured image.'),
    meta_title: z.string().optional().describe('New custom title for SEO.'),
    meta_description: z.string().optional().describe('New custom description for SEO.'),
    published_at: z.string().optional().describe('New publication date/time in ISO 8601 format.'),
    custom_excerpt: z.string().optional().describe('New custom short summary for the page.'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_update_page for page ID: ${input.id}`);
    try {
      await loadServices();

      const { id, ...updateData } = input;

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const updatedPage = await ghostServiceImproved.updatePage(id, updateData);
      console.error(`Page updated successfully. Page ID: ${updatedPage.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedPage, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_page:`, error);
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
  {
    id: z.string().describe('The ID of the page to delete.'),
  },
  async ({ id }) => {
    console.error(`Executing tool: ghost_delete_page for page ID: ${id}`);
    try {
      await loadServices();

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      await ghostServiceImproved.deletePage(id);
      console.error(`Page deleted successfully. Page ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Page ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_page:`, error);
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
  {
    query: z.string().describe('Search query to find in page titles.'),
    status: z
      .enum(['published', 'draft', 'scheduled', 'all'])
      .optional()
      .describe('Filter by page status. Default searches all statuses.'),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results (1-50). Default is 15.'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_search_pages with query: ${input.query}`);
    try {
      await loadServices();

      const options = {};
      if (input.status !== undefined) options.status = input.status;
      if (input.limit !== undefined) options.limit = input.limit;

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const pages = await ghostServiceImproved.searchPages(input.query, options);
      console.error(`Found ${pages.length} pages matching "${input.query}".`);

      return {
        content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_search_pages:`, error);
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

// Create Member Tool
server.tool(
  'ghost_create_member',
  'Creates a new member (subscriber) in Ghost CMS.',
  {
    email: z.string().email().describe('The email address of the member (required).'),
    name: z.string().optional().describe('The name of the member.'),
    note: z.string().optional().describe('A note about the member.'),
    labels: z.array(z.string()).optional().describe('List of label names to assign to the member.'),
    newsletters: z
      .array(z.object({ id: z.string() }))
      .optional()
      .describe('List of newsletter objects with id field to subscribe the member to.'),
    subscribed: z
      .boolean()
      .optional()
      .describe('Whether the member is subscribed to emails. Defaults to true.'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_create_member with email: ${input.email}`);
    try {
      await loadServices();

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const createdMember = await ghostServiceImproved.createMember(input);
      console.error(`Member created successfully. Member ID: ${createdMember.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(createdMember, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_create_member:`, error);
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
  {
    id: z.string().describe('The ID of the member to update.'),
    email: z.string().email().optional().describe('New email address for the member.'),
    name: z.string().optional().describe('New name for the member.'),
    note: z.string().optional().describe('New note about the member.'),
    labels: z
      .array(z.string())
      .optional()
      .describe('New list of label names to assign to the member.'),
    newsletters: z
      .array(z.object({ id: z.string() }))
      .optional()
      .describe('New list of newsletter objects with id field to subscribe the member to.'),
  },
  async (input) => {
    console.error(`Executing tool: ghost_update_member for member ID: ${input.id}`);
    try {
      await loadServices();

      const { id, ...updateData } = input;

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      const updatedMember = await ghostServiceImproved.updateMember(id, updateData);
      console.error(`Member updated successfully. Member ID: ${updatedMember.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(updatedMember, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in ghost_update_member:`, error);
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
  {
    id: z.string().describe('The ID of the member to delete.'),
  },
  async ({ id }) => {
    console.error(`Executing tool: ghost_delete_member for member ID: ${id}`);
    try {
      await loadServices();

      const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
      await ghostServiceImproved.deleteMember(id);
      console.error(`Member deleted successfully. Member ID: ${id}`);

      return {
        content: [{ type: 'text', text: `Member ${id} has been successfully deleted.` }],
      };
    } catch (error) {
      console.error(`Error in ghost_delete_member:`, error);
      return {
        content: [{ type: 'text', text: `Error deleting member: ${error.message}` }],
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
    'Available tools: ghost_get_tags, ghost_create_tag, ghost_upload_image, ' +
      'ghost_create_post, ghost_get_posts, ghost_get_post, ghost_search_posts, ghost_update_post, ghost_delete_post, ' +
      'ghost_get_pages, ghost_get_page, ghost_create_page, ghost_update_page, ghost_delete_page, ghost_search_pages, ' +
      'ghost_create_member, ghost_update_member, ghost_delete_member'
  );
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
