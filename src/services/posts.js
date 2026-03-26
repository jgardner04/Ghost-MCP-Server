import { GhostAPIError, ValidationError } from '../errors/index.js';
import { sanitizeNqlValue } from '../utils/nqlSanitizer.js';
import { handleApiRequest, readResource, updateWithOCC, deleteResource } from './ghostApiClient.js';
import { validators } from './validators.js';

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
