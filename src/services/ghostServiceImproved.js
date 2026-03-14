import GhostAdminAPI from '@tryghost/admin-api';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import {
  GhostAPIError,
  ConfigurationError,
  ValidationError,
  NotFoundError,
  ErrorHandler,
  CircuitBreaker,
  retryWithBackoff,
} from '../errors/index.js';
import { createContextLogger } from '../utils/logger.js';
import { sanitizeNqlValue } from '../utils/nqlSanitizer.js';

dotenv.config();

const logger = createContextLogger('ghost-service-improved');

const { GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY } = process.env;

// Validate configuration at startup
if (!GHOST_ADMIN_API_URL || !GHOST_ADMIN_API_KEY) {
  throw new ConfigurationError(
    'Ghost Admin API configuration is incomplete',
    ['GHOST_ADMIN_API_URL', 'GHOST_ADMIN_API_KEY'].filter((key) => !process.env[key])
  );
}

// Configure the Ghost Admin API client
const api = new GhostAdminAPI({
  url: GHOST_ADMIN_API_URL,
  key: GHOST_ADMIN_API_KEY,
  version: 'v5.0',
});

// Circuit breaker for Ghost API
const ghostCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringPeriod: 10000, // 10 seconds
});

/**
 * Enhanced handler for Ghost Admin API requests with circuit breaker and retry logic.
 * Routes requests to the appropriate Ghost API method based on the action type.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'pages', 'tags')
 * @param {string} action - API action to perform ('add', 'edit', 'upload', 'browse', 'read', 'delete')
 * @param {Object} [data={}] - Request payload data
 * @param {Object} [options={}] - Additional options passed to the Ghost API (e.g., filters, includes)
 * @param {Object} [config={}] - Execution configuration
 * @param {number} [config.maxRetries=3] - Maximum number of retry attempts
 * @param {boolean} [config.useCircuitBreaker=true] - Whether to use the circuit breaker
 * @returns {Promise<Object>} The Ghost API response
 * @throws {ValidationError} If the resource or action is invalid
 * @throws {GhostAPIError} If the Ghost API returns an error after all retries
 */
const handleApiRequest = async (resource, action, data = {}, options = {}, config = {}) => {
  // Validate inputs
  if (!api[resource] || typeof api[resource][action] !== 'function') {
    throw new ValidationError(`Invalid Ghost API resource or action: ${resource}.${action}`);
  }

  const operation = `${resource}.${action}`;
  const maxRetries = config.maxRetries ?? 3;
  const useCircuitBreaker = config.useCircuitBreaker ?? true;

  // Main execution function
  const executeRequest = async () => {
    try {
      logger.info('Executing Ghost API request', { operation });

      let result;

      // Handle different action signatures
      switch (action) {
        case 'add':
        case 'edit':
          result = await api[resource][action](data, options);
          break;
        case 'upload':
          result = await api[resource][action](data);
          break;
        case 'browse':
        case 'read':
          result = await api[resource][action](options, data);
          break;
        case 'delete':
          result = await api[resource][action](data.id || data, options);
          break;
        default:
          result = await api[resource][action](data);
      }

      logger.info('Successfully executed Ghost API request', { operation });
      return result;
    } catch (error) {
      // Transform Ghost API errors into our error types
      throw ErrorHandler.fromGhostError(error, operation);
    }
  };

  // Wrap with circuit breaker if enabled
  const wrappedExecute = useCircuitBreaker
    ? () => ghostCircuitBreaker.execute(executeRequest)
    : executeRequest;

  // Execute with retry logic
  try {
    return await retryWithBackoff(wrappedExecute, {
      maxAttempts: maxRetries,
      onRetry: (attempt, _error) => {
        logger.info('Retrying Ghost API request', { operation, attempt, maxRetries });

        // Log circuit breaker state if relevant
        if (useCircuitBreaker) {
          const state = ghostCircuitBreaker.getState();
          logger.info('Circuit breaker state', { operation, state });
        }
      },
    });
  } catch (error) {
    logger.error('Failed to execute Ghost API request', {
      operation,
      maxRetries,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Input validation helpers
 */
const validators = {
  /**
   * Validates that an ID is a non-empty string. Used by CRUD helpers to enforce
   * consistent ID validation across all resource types.
   * @param {string} id - The resource ID to validate
   * @param {string} entityName - Human-readable resource name for error messages (e.g., 'Post', 'Tag')
   * @throws {ValidationError} If the ID is falsy, not a string, or empty/whitespace
   */
  requireId(id, entityName) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new ValidationError(`${entityName} ID is required`);
    }
  },

  /**
   * Validates scheduling fields for posts and pages. Ensures published_at is present
   * when status is 'scheduled' and that the date is valid and in the future.
   * @param {Object} data - The resource data containing status and/or published_at
   * @param {string} [data.status] - Resource status ('draft', 'published', 'scheduled')
   * @param {string} [data.published_at] - ISO 8601 date string for scheduling
   * @param {string} [resourceLabel='Resource'] - Human-readable label for error messages
   * @throws {ValidationError} If scheduling validation fails
   */
  validateScheduledStatus(data, resourceLabel = 'Resource') {
    const errors = [];

    if (data.status === 'scheduled' && !data.published_at) {
      errors.push({
        field: 'published_at',
        message: 'published_at is required when status is scheduled',
      });
    }

    if (data.published_at) {
      const publishDate = new Date(data.published_at);
      if (isNaN(publishDate.getTime())) {
        errors.push({ field: 'published_at', message: 'Invalid date format' });
      } else if (data.status === 'scheduled' && publishDate <= new Date()) {
        errors.push({ field: 'published_at', message: 'Scheduled date must be in the future' });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`${resourceLabel} validation failed`, errors);
    }
  },

  /**
   * Validates post creation data. Requires a title and either html or mobiledoc content.
   * Also validates status values and delegates to validateScheduledStatus for scheduling.
   * @param {Object} postData - The post data to validate
   * @param {string} postData.title - Post title (required, non-empty)
   * @param {string} [postData.html] - HTML content (required if mobiledoc not provided)
   * @param {string} [postData.mobiledoc] - Mobiledoc content (required if html not provided)
   * @param {string} [postData.status] - Post status ('draft', 'published', 'scheduled')
   * @param {string} [postData.published_at] - ISO 8601 date for scheduled posts
   * @throws {ValidationError} If validation fails
   */
  validatePostData(postData) {
    const errors = [];

    if (!postData.title || postData.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title is required' });
    }

    if (!postData.html && !postData.mobiledoc) {
      errors.push({ field: 'content', message: 'Either html or mobiledoc content is required' });
    }

    if (postData.status && !['draft', 'published', 'scheduled'].includes(postData.status)) {
      errors.push({
        field: 'status',
        message: 'Invalid status. Must be draft, published, or scheduled',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Post validation failed', errors);
    }

    this.validateScheduledStatus(postData, 'Post');
  },

  /**
   * Validates tag creation data. Requires a non-empty name and validates slug format.
   * @param {Object} tagData - The tag data to validate
   * @param {string} tagData.name - Tag name (required, non-empty)
   * @param {string} [tagData.slug] - Tag slug (lowercase letters, numbers, hyphens only)
   * @throws {ValidationError} If validation fails
   */
  validateTagData(tagData) {
    const errors = [];

    if (!tagData.name || tagData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Tag name is required' });
    }

    if (tagData.slug && !/^[a-z0-9-]+$/.test(tagData.slug)) {
      errors.push({
        field: 'slug',
        message: 'Slug must contain only lowercase letters, numbers, and hyphens',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Tag validation failed', errors);
    }
  },

  /**
   * Validates tag update data. Name is optional but cannot be empty if provided.
   * Validates slug format if provided.
   * @param {Object} updateData - The tag update data to validate
   * @param {string} [updateData.name] - Tag name (cannot be empty if provided)
   * @param {string} [updateData.slug] - Tag slug (lowercase letters, numbers, hyphens only)
   * @throws {ValidationError} If validation fails
   */
  validateTagUpdateData(updateData) {
    const errors = [];

    // Name is optional in updates, but if provided, it cannot be empty
    if (updateData.name !== undefined && updateData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Tag name cannot be empty' });
    }

    // Validate slug format if provided
    if (updateData.slug && !/^[a-z0-9-]+$/.test(updateData.slug)) {
      errors.push({
        field: 'slug',
        message: 'Slug must contain only lowercase letters, numbers, and hyphens',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Tag update validation failed', errors);
    }
  },

  /**
   * Validates that an image path is a non-empty string and that the file exists on disk.
   * @param {string} imagePath - Absolute path to the image file
   * @returns {Promise<void>}
   * @throws {ValidationError} If imagePath is falsy or not a string
   * @throws {NotFoundError} If the file does not exist at the given path
   */
  async validateImagePath(imagePath) {
    if (!imagePath || typeof imagePath !== 'string') {
      throw new ValidationError('Image path is required and must be a string');
    }

    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch {
      throw new NotFoundError('Image file', imagePath);
    }
  },

  /**
   * Validates page creation data. Requires a title and either html or mobiledoc content.
   * Also validates status values and delegates to validateScheduledStatus for scheduling.
   * @param {Object} pageData - The page data to validate
   * @param {string} pageData.title - Page title (required, non-empty)
   * @param {string} [pageData.html] - HTML content (required if mobiledoc not provided)
   * @param {string} [pageData.mobiledoc] - Mobiledoc content (required if html not provided)
   * @param {string} [pageData.status] - Page status ('draft', 'published', 'scheduled')
   * @param {string} [pageData.published_at] - ISO 8601 date for scheduled pages
   * @throws {ValidationError} If validation fails
   */
  validatePageData(pageData) {
    const errors = [];

    if (!pageData.title || pageData.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title is required' });
    }

    if (!pageData.html && !pageData.mobiledoc) {
      errors.push({ field: 'content', message: 'Either html or mobiledoc content is required' });
    }

    if (pageData.status && !['draft', 'published', 'scheduled'].includes(pageData.status)) {
      errors.push({
        field: 'status',
        message: 'Invalid status. Must be draft, published, or scheduled',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Page validation failed', errors);
    }

    this.validateScheduledStatus(pageData, 'Page');
  },

  /**
   * Validates newsletter creation data. Requires a non-empty name.
   * @param {Object} newsletterData - The newsletter data to validate
   * @param {string} newsletterData.name - Newsletter name (required, non-empty)
   * @throws {ValidationError} If validation fails
   */
  validateNewsletterData(newsletterData) {
    const errors = [];

    if (!newsletterData.name || newsletterData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Newsletter name is required' });
    }

    if (errors.length > 0) {
      throw new ValidationError('Newsletter validation failed', errors);
    }
  },
};

/**
 * Reads a single resource by ID with 404-to-NotFoundError handling.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'tags')
 * @param {string} id - The resource ID to read
 * @param {string} label - Human-readable resource label for error messages
 * @param {Object} [options={}] - Additional options passed to the Ghost API
 * @returns {Promise<Object>} The resource object from Ghost
 * @throws {ValidationError} If the ID is missing or invalid
 * @throws {NotFoundError} If the resource is not found (404)
 * @throws {GhostAPIError} If the API request fails for other reasons
 */
async function readResource(resource, id, label, options = {}) {
  validators.requireId(id, label);
  try {
    return await handleApiRequest(resource, 'read', { id }, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError(label, id);
    }
    throw error;
  }
}

/**
 * Updates a resource using optimistic concurrency control (OCC).
 * Reads the current version first to obtain updated_at, then merges it into the edit payload.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'tags')
 * @param {string} id - The resource ID to update
 * @param {Object} updateData - Fields to update on the resource
 * @param {Object} [options={}] - Additional options passed to the Ghost API
 * @param {string} [label=resource] - Human-readable resource label for error messages
 * @returns {Promise<Object>} The updated resource object from Ghost
 * @throws {ValidationError} If the ID is missing or invalid
 * @throws {NotFoundError} If the resource is not found (404)
 * @throws {GhostAPIError} If the API request fails for other reasons
 */
async function updateWithOCC(resource, id, updateData, options = {}, label = resource) {
  const existing = await readResource(resource, id, label);
  const editData = { ...updateData, updated_at: existing.updated_at };
  try {
    return await handleApiRequest(resource, 'edit', { id, ...editData }, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError(label, id);
    }
    throw error;
  }
}

/**
 * Deletes a resource by ID with 404-to-NotFoundError handling.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'tags')
 * @param {string} id - The resource ID to delete
 * @param {string} label - Human-readable resource label for error messages
 * @returns {Promise<Object>} The Ghost API deletion response
 * @throws {ValidationError} If the ID is missing or invalid
 * @throws {NotFoundError} If the resource is not found (404)
 * @throws {GhostAPIError} If the API request fails for other reasons
 */
async function deleteResource(resource, id, label) {
  validators.requireId(id, label);
  try {
    return await handleApiRequest(resource, 'delete', { id });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError(label, id);
    }
    throw error;
  }
}

/**
 * Service functions with enhanced error handling
 */

/**
 * Retrieves Ghost site metadata (title, version, URL).
 * @returns {Promise<Object>} Site information object
 * @throws {GhostAPIError} If the API request fails
 */
export async function getSiteInfo() {
  return handleApiRequest('site', 'read');
}

/**
 * Creates a new post in Ghost CMS.
 * @param {Object} postData - The post data
 * @param {string} postData.title - Post title (required)
 * @param {string} [postData.html] - HTML content (required if mobiledoc not provided)
 * @param {string} [postData.mobiledoc] - Mobiledoc content (required if html not provided)
 * @param {string} [postData.status='draft'] - Post status ('draft', 'published', 'scheduled')
 * @param {string} [postData.published_at] - ISO 8601 date for scheduled posts
 * @param {Object} [options={ source: 'html' }] - API request options
 * @returns {Promise<Object>} The created post object
 * @throws {ValidationError} If validation fails or Ghost returns a 422
 * @throws {GhostAPIError} If the API request fails
 */
export async function createPost(postData, options = { source: 'html' }) {
  // Validate input
  validators.validatePostData(postData);

  // Add defaults
  const dataWithDefaults = {
    status: 'draft',
    ...postData,
  };

  // SECURITY: HTML must be sanitized before reaching this function. See htmlContentSchema in schemas/common.js

  try {
    return await handleApiRequest('posts', 'add', dataWithDefaults, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      // Transform Ghost validation errors into our format
      throw new ValidationError('Post creation failed due to validation errors', [
        { field: 'post', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Updates an existing post with optimistic concurrency control.
 * Validates scheduling fields when status or published_at is being changed.
 * @param {string} postId - The post ID to update
 * @param {Object} updateData - Fields to update on the post
 * @param {Object} [options={}] - API request options
 * @returns {Promise<Object>} The updated post object
 * @throws {ValidationError} If the post ID is missing or scheduling validation fails
 * @throws {NotFoundError} If the post is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function updatePost(postId, updateData, options = {}) {
  validators.requireId(postId, 'Post');

  // Validate scheduled status when status or published_at is being updated
  if (updateData.status || updateData.published_at) {
    let validationData = updateData;
    // When only published_at changes, fetch existing status to check if post is scheduled
    if (!updateData.status && updateData.published_at) {
      const existing = await readResource('posts', postId, 'Post');
      validationData = { ...updateData, status: existing.status };
    }
    validators.validateScheduledStatus(validationData, 'Post');
  }

  return updateWithOCC('posts', postId, updateData, options, 'Post');
}

/**
 * Deletes a post by ID.
 * @param {string} postId - The post ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {ValidationError} If the post ID is missing
 * @throws {NotFoundError} If the post is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function deletePost(postId) {
  return deleteResource('posts', postId, 'Post');
}

/**
 * Retrieves a single post by ID.
 * @param {string} postId - The post ID to retrieve
 * @param {Object} [options={}] - API request options (e.g., includes)
 * @returns {Promise<Object>} The post object
 * @throws {ValidationError} If the post ID is missing
 * @throws {NotFoundError} If the post is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function getPost(postId, options = {}) {
  return readResource('posts', postId, 'Post', options);
}

/**
 * Lists posts with optional filtering and pagination.
 * @param {Object} [options={}] - Query options
 * @param {number} [options.limit=15] - Number of posts to return
 * @param {string} [options.include='tags,authors'] - Related resources to include
 * @param {string} [options.filter] - NQL filter string
 * @param {string} [options.order] - Order string (e.g., 'published_at desc')
 * @returns {Promise<Array>} Array of post objects
 * @throws {GhostAPIError} If the API request fails
 */
export async function getPosts(options = {}) {
  const defaultOptions = {
    limit: 15,
    include: 'tags,authors',
    ...options,
  };

  return handleApiRequest('posts', 'browse', {}, defaultOptions);
}

/**
 * Searches posts by title using Ghost NQL fuzzy matching.
 * @param {string} query - Search query string (required, non-empty)
 * @param {Object} [options={}] - Additional search options
 * @param {string} [options.status] - Filter by status ('draft', 'published', 'scheduled', or 'all')
 * @param {number} [options.limit=15] - Maximum number of results
 * @returns {Promise<Array>} Array of matching post objects
 * @throws {ValidationError} If the query is empty
 * @throws {GhostAPIError} If the API request fails
 */
export async function searchPosts(query, options = {}) {
  // Validate query
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }

  // Sanitize query - escape special NQL characters to prevent injection
  const sanitizedQuery = sanitizeNqlValue(query);

  // Build filter with fuzzy title match using Ghost NQL
  const filterParts = [`title:~'${sanitizedQuery}'`];

  // Add status filter if provided and not 'all'
  if (options.status && options.status !== 'all') {
    filterParts.push(`status:${options.status}`);
  }

  const searchOptions = {
    limit: options.limit || 15,
    include: 'tags,authors',
    filter: filterParts.join('+'),
  };

  return handleApiRequest('posts', 'browse', {}, searchOptions);
}

/**
 * Page CRUD Operations
 * Pages are similar to posts but do NOT support tags
 */

/**
 * Creates a new page in Ghost CMS.
 * @param {Object} pageData - The page data
 * @param {string} pageData.title - Page title (required)
 * @param {string} [pageData.html] - HTML content (required if mobiledoc not provided)
 * @param {string} [pageData.mobiledoc] - Mobiledoc content (required if html not provided)
 * @param {string} [pageData.status='draft'] - Page status ('draft', 'published', 'scheduled')
 * @param {string} [pageData.published_at] - ISO 8601 date for scheduled pages
 * @param {Object} [options={ source: 'html' }] - API request options
 * @returns {Promise<Object>} The created page object
 * @throws {ValidationError} If validation fails or Ghost returns a 422
 * @throws {GhostAPIError} If the API request fails
 */
export async function createPage(pageData, options = { source: 'html' }) {
  // Validate input
  validators.validatePageData(pageData);

  // Add defaults
  const dataWithDefaults = {
    status: 'draft',
    ...pageData,
  };

  // SECURITY: HTML must be sanitized before reaching this function. See htmlContentSchema in schemas/common.js

  try {
    return await handleApiRequest('pages', 'add', dataWithDefaults, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Page creation failed due to validation errors', [
        { field: 'page', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Updates an existing page with optimistic concurrency control.
 * Validates scheduling fields when status or published_at is being changed.
 * @param {string} pageId - The page ID to update
 * @param {Object} updateData - Fields to update on the page
 * @param {Object} [options={}] - API request options
 * @returns {Promise<Object>} The updated page object
 * @throws {ValidationError} If the page ID is missing or scheduling validation fails
 * @throws {NotFoundError} If the page is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function updatePage(pageId, updateData, options = {}) {
  validators.requireId(pageId, 'Page');

  // SECURITY: HTML must be sanitized before reaching this function. See htmlContentSchema in schemas/common.js

  // Validate scheduled status when status or published_at is being updated
  if (updateData.status || updateData.published_at) {
    let validationData = updateData;
    // When only published_at changes, fetch existing status to check if page is scheduled
    if (!updateData.status && updateData.published_at) {
      const existing = await readResource('pages', pageId, 'Page');
      validationData = { ...updateData, status: existing.status };
    }
    validators.validateScheduledStatus(validationData, 'Page');
  }

  return updateWithOCC('pages', pageId, updateData, options, 'Page');
}

/**
 * Deletes a page by ID.
 * @param {string} pageId - The page ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {ValidationError} If the page ID is missing
 * @throws {NotFoundError} If the page is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function deletePage(pageId) {
  return deleteResource('pages', pageId, 'Page');
}

/**
 * Retrieves a single page by ID.
 * @param {string} pageId - The page ID to retrieve
 * @param {Object} [options={}] - API request options (e.g., includes)
 * @returns {Promise<Object>} The page object
 * @throws {ValidationError} If the page ID is missing
 * @throws {NotFoundError} If the page is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function getPage(pageId, options = {}) {
  return readResource('pages', pageId, 'Page', options);
}

/**
 * Lists pages with optional filtering and pagination.
 * @param {Object} [options={}] - Query options
 * @param {number} [options.limit=15] - Number of pages to return
 * @param {string} [options.include='authors'] - Related resources to include
 * @param {string} [options.filter] - NQL filter string
 * @param {string} [options.order] - Order string
 * @returns {Promise<Array>} Array of page objects
 * @throws {GhostAPIError} If the API request fails
 */
export async function getPages(options = {}) {
  const defaultOptions = {
    limit: 15,
    include: 'authors',
    ...options,
  };

  return handleApiRequest('pages', 'browse', {}, defaultOptions);
}

/**
 * Searches pages by title using Ghost NQL fuzzy matching.
 * @param {string} query - Search query string (required, non-empty)
 * @param {Object} [options={}] - Additional search options
 * @param {string} [options.status] - Filter by status ('draft', 'published', 'scheduled', or 'all')
 * @param {number} [options.limit=15] - Maximum number of results
 * @returns {Promise<Array>} Array of matching page objects
 * @throws {ValidationError} If the query is empty
 * @throws {GhostAPIError} If the API request fails
 */
export async function searchPages(query, options = {}) {
  // Validate query
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }

  // Sanitize query - escape special NQL characters to prevent injection
  const sanitizedQuery = sanitizeNqlValue(query);

  // Build filter with fuzzy title match using Ghost NQL
  const filterParts = [`title:~'${sanitizedQuery}'`];

  // Add status filter if provided and not 'all'
  if (options.status && options.status !== 'all') {
    filterParts.push(`status:${options.status}`);
  }

  const searchOptions = {
    limit: options.limit || 15,
    include: 'authors',
    filter: filterParts.join('+'),
  };

  return handleApiRequest('pages', 'browse', {}, searchOptions);
}

/**
 * Uploads an image to Ghost CMS from a local file path.
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<Object>} The uploaded image object with URL
 * @throws {ValidationError} If the path is invalid or upload fails
 * @throws {NotFoundError} If the file does not exist
 * @throws {GhostAPIError} If the API request fails
 */
export async function uploadImage(imagePath) {
  // Validate input
  await validators.validateImagePath(imagePath);

  const imageData = { file: imagePath };

  try {
    return await handleApiRequest('images', 'upload', imageData);
  } catch (error) {
    if (error instanceof GhostAPIError) {
      throw new ValidationError(`Image upload failed: ${error.originalError}`);
    }
    throw error;
  }
}

/**
 * Creates a new tag in Ghost CMS. Auto-generates a slug from the name if not provided.
 * If a tag with the same name already exists, returns the existing tag instead of failing.
 * @param {Object} tagData - The tag data
 * @param {string} tagData.name - Tag name (required)
 * @param {string} [tagData.slug] - Tag slug (auto-generated from name if omitted)
 * @param {string} [tagData.description] - Tag description
 * @returns {Promise<Object>} The created (or existing) tag object
 * @throws {ValidationError} If validation fails or Ghost returns a 422 (non-duplicate)
 * @throws {GhostAPIError} If the API request fails
 */
export async function createTag(tagData) {
  // Validate input
  validators.validateTagData(tagData);

  // Auto-generate slug if not provided
  if (!tagData.slug) {
    tagData.slug = tagData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  try {
    return await handleApiRequest('tags', 'add', tagData);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      // Check if it's a duplicate tag error
      if (error.originalError.includes('already exists')) {
        // Try to fetch the existing tag by name filter
        const existingTags = await getTags({ filter: `name:'${tagData.name}'` });
        if (existingTags.length > 0) {
          return existingTags[0]; // Return existing tag instead of failing
        }
      }
      throw new ValidationError('Tag creation failed', [
        { field: 'tag', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Lists tags with optional filtering and pagination.
 * @param {Object} [options={}] - Query options
 * @param {number} [options.limit=15] - Number of tags to return
 * @param {string} [options.filter] - NQL filter string
 * @param {string} [options.order] - Order string
 * @returns {Promise<Array>} Array of tag objects (empty array if none found)
 * @throws {GhostAPIError} If the API request fails
 */
export async function getTags(options = {}) {
  const tags = await handleApiRequest(
    'tags',
    'browse',
    {},
    {
      limit: 15,
      ...options,
    }
  );
  return tags || [];
}

/**
 * Retrieves a single tag by ID.
 * @param {string} tagId - The tag ID to retrieve
 * @param {Object} [options={}] - API request options
 * @returns {Promise<Object>} The tag object
 * @throws {ValidationError} If the tag ID is missing
 * @throws {NotFoundError} If the tag is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function getTag(tagId, options = {}) {
  return readResource('tags', tagId, 'Tag', options);
}

/**
 * Updates an existing tag. Validates update data and checks that the tag exists first.
 * @param {string} tagId - The tag ID to update
 * @param {Object} updateData - Fields to update on the tag
 * @param {string} [updateData.name] - Updated tag name
 * @param {string} [updateData.slug] - Updated tag slug
 * @param {string} [updateData.description] - Updated tag description
 * @returns {Promise<Object>} The updated tag object
 * @throws {ValidationError} If the tag ID is missing or update data is invalid
 * @throws {NotFoundError} If the tag is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function updateTag(tagId, updateData) {
  validators.requireId(tagId, 'Tag');

  validators.validateTagUpdateData(updateData);

  try {
    await readResource('tags', tagId, 'Tag');
    return await handleApiRequest('tags', 'edit', { id: tagId, ...updateData });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Tag update failed', [
        { field: 'tag', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Deletes a tag by ID.
 * @param {string} tagId - The tag ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {ValidationError} If the tag ID is missing
 * @throws {NotFoundError} If the tag is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function deleteTag(tagId) {
  return deleteResource('tags', tagId, 'Tag');
}

/**
 * Member CRUD Operations
 * Members represent subscribers/users in Ghost CMS
 */

/**
 * Creates a new member (subscriber) in Ghost CMS
 * @param {Object} memberData - The member data
 * @param {string} memberData.email - Member email (required)
 * @param {string} [memberData.name] - Member name
 * @param {string} [memberData.note] - Notes about the member (HTML will be sanitized)
 * @param {string[]} [memberData.labels] - Array of label names
 * @param {Object[]} [memberData.newsletters] - Array of newsletter objects with id
 * @param {boolean} [memberData.subscribed] - Email subscription status
 * @param {Object} [options] - Additional options for the API request
 * @returns {Promise<Object>} The created member object
 * @throws {ValidationError} If validation fails
 * @throws {GhostAPIError} If the API request fails
 */
export async function createMember(memberData, options = {}) {
  // Input validation is performed at the MCP tool layer using Zod schemas
  try {
    return await handleApiRequest('members', 'add', memberData, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Member creation failed due to validation errors', [
        { field: 'member', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Updates an existing member in Ghost CMS
 * @param {string} memberId - The member ID to update
 * @param {Object} updateData - The member update data
 * @param {string} [updateData.email] - Member email
 * @param {string} [updateData.name] - Member name
 * @param {string} [updateData.note] - Notes about the member (HTML will be sanitized)
 * @param {string[]} [updateData.labels] - Array of label names
 * @param {Object[]} [updateData.newsletters] - Array of newsletter objects with id
 * @param {boolean} [updateData.subscribed] - Email subscription status
 * @param {Object} [options] - Additional options for the API request
 * @returns {Promise<Object>} The updated member object
 * @throws {ValidationError} If validation fails
 * @throws {NotFoundError} If the member is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function updateMember(memberId, updateData, options = {}) {
  // Input validation is performed at the MCP tool layer using Zod schemas
  validators.requireId(memberId, 'Member');

  return updateWithOCC('members', memberId, updateData, options, 'Member');
}

/**
 * Deletes a member from Ghost CMS
 * @param {string} memberId - The member ID to delete
 * @returns {Promise<Object>} Deletion confirmation object
 * @throws {ValidationError} If member ID is not provided
 * @throws {NotFoundError} If the member is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function deleteMember(memberId) {
  return deleteResource('members', memberId, 'Member');
}

/**
 * List members from Ghost CMS with optional filtering and pagination
 * @param {Object} [options] - Query options
 * @param {number} [options.limit] - Number of members to return (1-100)
 * @param {number} [options.page] - Page number (1+)
 * @param {string} [options.filter] - NQL filter string (e.g., 'status:paid')
 * @param {string} [options.order] - Order string (e.g., 'created_at desc')
 * @param {string} [options.include] - Include string (e.g., 'labels,newsletters')
 * @returns {Promise<Array>} Array of member objects
 * @throws {ValidationError} If validation fails
 * @throws {GhostAPIError} If the API request fails
 */
export async function getMembers(options = {}) {
  // Input validation is performed at the MCP tool layer using Zod schemas
  const defaultOptions = {
    limit: 15,
    ...options,
  };

  const members = await handleApiRequest('members', 'browse', {}, defaultOptions);
  return members || [];
}

/**
 * Get a single member from Ghost CMS by ID or email
 * @param {Object} params - Lookup parameters (id OR email required)
 * @param {string} [params.id] - Member ID
 * @param {string} [params.email] - Member email
 * @returns {Promise<Object>} The member object
 * @throws {ValidationError} If validation fails
 * @throws {NotFoundError} If the member is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function getMember(params) {
  // Input validation is performed at the MCP tool layer using Zod schemas
  const { id, email } = params;

  try {
    if (id) {
      // Lookup by ID using read endpoint
      return await handleApiRequest('members', 'read', { id }, { id });
    } else {
      // Lookup by email using browse with filter
      const sanitizedEmail = sanitizeNqlValue(email);
      const members = await handleApiRequest(
        'members',
        'browse',
        {},
        { filter: `email:'${sanitizedEmail}'`, limit: 1 }
      );

      if (!members || members.length === 0) {
        throw new NotFoundError('Member', email);
      }

      return members[0];
    }
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Member', id || email);
    }
    throw error;
  }
}

/**
 * Search members by name or email
 * @param {string} query - Search query (searches name and email fields)
 * @param {Object} [options] - Additional options
 * @param {number} [options.limit] - Maximum number of results (default: 15)
 * @returns {Promise<Array>} Array of matching member objects
 * @throws {ValidationError} If validation fails
 * @throws {GhostAPIError} If the API request fails
 */
export async function searchMembers(query, options = {}) {
  // Input validation is performed at the MCP tool layer using Zod schemas
  const sanitizedQuery = sanitizeNqlValue(query.trim());

  const limit = options.limit || 15;

  // Build NQL filter for name or email containing the query
  // Ghost uses ~ for contains/like matching
  const filter = `name:~'${sanitizedQuery}',email:~'${sanitizedQuery}'`;

  const members = await handleApiRequest('members', 'browse', {}, { filter, limit });
  return members || [];
}

/**
 * Newsletter CRUD Operations
 */

/**
 * Lists all newsletters with optional filtering and pagination.
 * @param {Object} [options={}] - Query options
 * @param {string|number} [options.limit='all'] - Number of newsletters to return (default: 'all')
 * @returns {Promise<Array>} Array of newsletter objects (empty array if none found)
 * @throws {GhostAPIError} If the API request fails
 */
export async function getNewsletters(options = {}) {
  const defaultOptions = {
    limit: 'all',
    ...options,
  };

  const newsletters = await handleApiRequest('newsletters', 'browse', {}, defaultOptions);
  return newsletters || [];
}

/**
 * Retrieves a single newsletter by ID.
 * @param {string} newsletterId - The newsletter ID to retrieve
 * @returns {Promise<Object>} The newsletter object
 * @throws {ValidationError} If the newsletter ID is missing
 * @throws {NotFoundError} If the newsletter is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function getNewsletter(newsletterId) {
  return readResource('newsletters', newsletterId, 'Newsletter');
}

/**
 * Creates a new newsletter in Ghost CMS.
 * @param {Object} newsletterData - The newsletter data
 * @param {string} newsletterData.name - Newsletter name (required)
 * @param {string} [newsletterData.description] - Newsletter description
 * @param {string} [newsletterData.sender_name] - Sender name
 * @param {string} [newsletterData.sender_email] - Sender email
 * @returns {Promise<Object>} The created newsletter object
 * @throws {ValidationError} If validation fails or Ghost returns a 422
 * @throws {GhostAPIError} If the API request fails
 */
export async function createNewsletter(newsletterData) {
  // Validate input
  validators.validateNewsletterData(newsletterData);

  try {
    return await handleApiRequest('newsletters', 'add', newsletterData);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Newsletter creation failed', [
        { field: 'newsletter', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Updates an existing newsletter with optimistic concurrency control.
 * @param {string} newsletterId - The newsletter ID to update
 * @param {Object} updateData - Fields to update on the newsletter
 * @returns {Promise<Object>} The updated newsletter object
 * @throws {ValidationError} If the newsletter ID is missing or Ghost returns a 422
 * @throws {NotFoundError} If the newsletter is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function updateNewsletter(newsletterId, updateData) {
  validators.requireId(newsletterId, 'Newsletter');

  try {
    return await updateWithOCC('newsletters', newsletterId, updateData, {}, 'Newsletter');
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Newsletter update failed', [
        { field: 'newsletter', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Deletes a newsletter by ID.
 * @param {string} newsletterId - The newsletter ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {ValidationError} If the newsletter ID is missing
 * @throws {NotFoundError} If the newsletter is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function deleteNewsletter(newsletterId) {
  return deleteResource('newsletters', newsletterId, 'Newsletter');
}

/**
 * Create a new tier (membership level)
 * @param {Object} tierData - Tier data
 * @param {Object} [options={}] - Options for the API request
 * @returns {Promise<Object>} Created tier
 * @throws {ValidationError} If validation fails or Ghost returns a 422
 * @throws {GhostAPIError} If the API request fails
 */
export async function createTier(tierData, options = {}) {
  const { validateTierData } = await import('./tierService.js');
  validateTierData(tierData);

  try {
    return await handleApiRequest('tiers', 'add', tierData, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Tier creation failed due to validation errors', [
        { field: 'tier', message: error.originalError },
      ]);
    }
    throw error;
  }
}

/**
 * Update an existing tier with optimistic concurrency control.
 * @param {string} id - Tier ID
 * @param {Object} updateData - Tier update data
 * @param {Object} [options={}] - Options for the API request
 * @returns {Promise<Object>} Updated tier
 * @throws {ValidationError} If the tier ID is missing or update data is invalid
 * @throws {NotFoundError} If the tier is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function updateTier(id, updateData, options = {}) {
  validators.requireId(id, 'Tier');

  const { validateTierUpdateData } = await import('./tierService.js');
  validateTierUpdateData(updateData);

  return updateWithOCC('tiers', id, updateData, options, 'Tier');
}

/**
 * Delete a tier by ID.
 * @param {string} id - Tier ID
 * @returns {Promise<Object>} Deletion result
 * @throws {ValidationError} If the tier ID is missing
 * @throws {NotFoundError} If the tier is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function deleteTier(id) {
  validators.requireId(id, 'Tier');

  return deleteResource('tiers', id, 'Tier');
}

/**
 * Get all tiers with optional filtering
 * @param {Object} [options={}] - Query options
 * @param {number} [options.limit] - Number of tiers to return (1-100, default 15)
 * @param {number} [options.page] - Page number
 * @param {string} [options.filter] - NQL filter string (e.g., "type:paid", "type:free")
 * @param {string} [options.order] - Order string
 * @param {string} [options.include] - Include string
 * @returns {Promise<Array>} Array of tiers
 * @throws {GhostAPIError} If the API request fails
 */
export async function getTiers(options = {}) {
  const { validateTierQueryOptions } = await import('./tierService.js');
  validateTierQueryOptions(options);

  const defaultOptions = {
    limit: 15,
    ...options,
  };

  const tiers = await handleApiRequest('tiers', 'browse', {}, defaultOptions);
  return tiers || [];
}

/**
 * Get a single tier by ID.
 * @param {string} id - Tier ID
 * @returns {Promise<Object>} Tier object
 * @throws {ValidationError} If the tier ID is missing
 * @throws {NotFoundError} If the tier is not found
 * @throws {GhostAPIError} If the API request fails
 */
export async function getTier(id) {
  validators.requireId(id, 'Tier');

  return readResource('tiers', id, 'Tier');
}

/**
 * Checks the health of the Ghost API connection and circuit breaker state.
 * @returns {Promise<Object>} Health status with site info, circuit breaker state, and timestamp
 */
export async function checkHealth() {
  try {
    const site = await getSiteInfo();
    const circuitState = ghostCircuitBreaker.getState();

    return {
      status: 'healthy',
      site: {
        title: site.title,
        version: site.version,
        url: site.url,
      },
      circuitBreaker: circuitState,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      circuitBreaker: ghostCircuitBreaker.getState(),
      timestamp: new Date().toISOString(),
    };
  }
}

// Export everything including the API client for backward compatibility
export { api, ghostCircuitBreaker, validators };

export default {
  getSiteInfo,
  createPost,
  updatePost,
  deletePost,
  getPost,
  getPosts,
  searchPosts,
  createPage,
  updatePage,
  deletePage,
  getPage,
  getPages,
  searchPages,
  uploadImage,
  createTag,
  getTags,
  getTag,
  updateTag,
  deleteTag,
  createMember,
  updateMember,
  deleteMember,
  getMembers,
  getMember,
  searchMembers,
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
  createTier,
  updateTier,
  deleteTier,
  getTiers,
  getTier,
  checkHealth,
};
