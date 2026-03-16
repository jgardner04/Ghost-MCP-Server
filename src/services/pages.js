import { ValidationError } from '../errors/index.js';
import { sanitizeNqlValue } from '../utils/nqlSanitizer.js';
import { handleApiRequest, readResource } from './ghostApiClient.js';
import { createResourceService } from './createResourceService.js';
import { validators } from './validators.js';

const service = createResourceService({
  resource: 'pages',
  label: 'Page',
  createDefaults: { status: 'draft' },
  createOptions: { source: 'html' },
  listDefaults: { limit: 15, include: 'authors' },
  validateCreate: (data) => validators.validatePageData(data),
  validateUpdate: async (id, updateData) => {
    if (updateData.status || updateData.published_at) {
      let validationData = updateData;
      if (!updateData.status && updateData.published_at) {
        const existing = await readResource('pages', id, 'Page');
        validationData = { ...updateData, status: existing.status };
      }
      validators.validateScheduledStatus(validationData, 'Page');
    }
  },
});

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
export const createPage = service.create;

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
export const updatePage = service.update;

/**
 * Deletes a page by ID.
 * @param {string} pageId - The page ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {ValidationError} If the page ID is missing
 * @throws {NotFoundError} If the page is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const deletePage = service.remove;

/**
 * Retrieves a single page by ID.
 * @param {string} pageId - The page ID to retrieve
 * @param {Object} [options={}] - API request options (e.g., includes)
 * @returns {Promise<Object>} The page object
 * @throws {ValidationError} If the page ID is missing
 * @throws {NotFoundError} If the page is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const getPage = service.getOne;

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
export const getPages = service.getList;

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
    include: 'authors',
    filter: filterParts.join('+'),
  };

  return handleApiRequest('pages', 'browse', {}, searchOptions);
}
