import { createResourceService } from './createResourceService.js';
import {
  validateTierData,
  validateTierUpdateData,
  validateTierQueryOptions,
} from './tierService.js';

const service = createResourceService({
  resource: 'tiers',
  label: 'Tier',
  listDefaults: { limit: 15 },
  validateCreate: (data) => validateTierData(data),
  validateUpdate: (_id, data) => validateTierUpdateData(data),
});

/**
 * Create a new tier (membership level)
 * @param {Object} tierData - Tier data
 * @param {Object} [options={}] - Options for the API request
 * @returns {Promise<Object>} Created tier
 * @throws {ValidationError} If validation fails or Ghost returns a 422
 * @throws {GhostAPIError} If the API request fails
 */
export const createTier = service.create;

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
export const updateTier = service.update;

/**
 * Delete a tier by ID.
 * @param {string} id - Tier ID
 * @returns {Promise<Object>} Deletion result
 * @throws {ValidationError} If the tier ID is missing
 * @throws {NotFoundError} If the tier is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const deleteTier = service.remove;

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
  validateTierQueryOptions(options);
  return service.getList(options);
}

/**
 * Get a single tier by ID.
 * @param {string} id - Tier ID
 * @returns {Promise<Object>} Tier object
 * @throws {ValidationError} If the tier ID is missing
 * @throws {NotFoundError} If the tier is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const getTier = service.getOne;
