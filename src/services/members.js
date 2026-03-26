import { GhostAPIError, ValidationError, NotFoundError } from '../errors/index.js';
import { sanitizeNqlValue } from '../utils/nqlSanitizer.js';
import { handleApiRequest, updateWithOCC, deleteResource } from './ghostApiClient.js';
import { validators } from './validators.js';

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
