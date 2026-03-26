import { ValidationError } from '../errors/index.js';
import { sanitizeNqlValue } from '../utils/nqlSanitizer.js';
import { handleApiRequest, readResource } from './ghostApiClient.js';
import { createResourceService } from './createResourceService.js';
import { validators } from './validators.js';

const service = createResourceService({
  resource: 'posts',
  label: 'Post',
  createDefaults: { status: 'draft' },
  createOptions: { source: 'html' },
  listDefaults: { limit: 15, include: 'tags,authors' },
  validateCreate: (data) => validators.validatePostData(data),
  validateUpdate: async (id, updateData) => {
    if (updateData.status || updateData.published_at) {
      let validationData = updateData;
      if (!updateData.status && updateData.published_at) {
        const existing = await readResource('posts', id, 'Post');
        validationData = { ...updateData, status: existing.status };
      }
      validators.validateScheduledStatus(validationData, 'Post');
    }
  },
});

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
export const createPost = service.create;

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
export const updatePost = service.update;

/**
 * Deletes a post by ID.
 * @param {string} postId - The post ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {ValidationError} If the post ID is missing
 * @throws {NotFoundError} If the post is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const deletePost = service.remove;

/**
 * Retrieves a single post by ID.
 * @param {string} postId - The post ID to retrieve
 * @param {Object} [options={}] - API request options (e.g., includes)
 * @returns {Promise<Object>} The post object
 * @throws {ValidationError} If the post ID is missing
 * @throws {NotFoundError} If the post is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const getPost = service.getOne;

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
export const getPosts = service.getList;

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
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }

  const sanitizedQuery = sanitizeNqlValue(query);

  const filterParts = [`title:~'${sanitizedQuery}'`];
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
