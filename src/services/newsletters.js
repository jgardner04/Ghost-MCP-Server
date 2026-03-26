import { createResourceService } from './createResourceService.js';
import { validators } from './validators.js';

const service = createResourceService({
  resource: 'newsletters',
  label: 'Newsletter',
  listDefaults: { limit: 'all' },
  validateCreate: (data) => validators.validateNewsletterData(data),
  catch422OnUpdate: true,
});

/**
 * Lists all newsletters with optional filtering and pagination.
 * @param {Object} [options={}] - Query options
 * @param {string|number} [options.limit='all'] - Number of newsletters to return (default: 'all')
 * @returns {Promise<Array>} Array of newsletter objects (empty array if none found)
 * @throws {GhostAPIError} If the API request fails
 */
export const getNewsletters = service.getList;

/**
 * Retrieves a single newsletter by ID.
 * @param {string} newsletterId - The newsletter ID to retrieve
 * @returns {Promise<Object>} The newsletter object
 * @throws {ValidationError} If the newsletter ID is missing
 * @throws {NotFoundError} If the newsletter is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const getNewsletter = service.getOne;

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
export const createNewsletter = service.create;

/**
 * Updates an existing newsletter with optimistic concurrency control.
 * @param {string} newsletterId - The newsletter ID to update
 * @param {Object} updateData - Fields to update on the newsletter
 * @returns {Promise<Object>} The updated newsletter object
 * @throws {ValidationError} If the newsletter ID is missing or Ghost returns a 422
 * @throws {NotFoundError} If the newsletter is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const updateNewsletter = service.update;

/**
 * Deletes a newsletter by ID.
 * @param {string} newsletterId - The newsletter ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {ValidationError} If the newsletter ID is missing
 * @throws {NotFoundError} If the newsletter is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const deleteNewsletter = service.remove;
