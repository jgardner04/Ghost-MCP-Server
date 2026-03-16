import { GhostAPIError, ValidationError } from '../errors/index.js';
import { handleApiRequest, readResource, updateWithOCC, deleteResource } from './ghostApiClient.js';
import { validators } from './validators.js';

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
