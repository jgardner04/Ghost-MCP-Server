import { GhostAPIError, ValidationError } from '../errors/index.js';
import { handleApiRequest, readResource, updateWithOCC, deleteResource } from './ghostApiClient.js';
import { validators } from './validators.js';

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
