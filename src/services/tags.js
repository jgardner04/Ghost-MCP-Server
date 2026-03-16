import { GhostAPIError, ValidationError, NotFoundError } from '../errors/index.js';
import { handleApiRequest, readResource } from './ghostApiClient.js';
import { createResourceService } from './createResourceService.js';
import { validators } from './validators.js';

const service = createResourceService({
  resource: 'tags',
  label: 'Tag',
  listDefaults: { limit: 15 },
});

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
  validators.validateTagData(tagData);

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
      if (error.originalError.includes('already exists')) {
        const existingTags = await getTags({ filter: `name:'${tagData.name}'` });
        if (existingTags.length > 0) {
          return existingTags[0];
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
export const getTags = service.getList;

/**
 * Retrieves a single tag by ID.
 * @param {string} tagId - The tag ID to retrieve
 * @param {Object} [options={}] - API request options
 * @returns {Promise<Object>} The tag object
 * @throws {ValidationError} If the tag ID is missing
 * @throws {NotFoundError} If the tag is not found
 * @throws {GhostAPIError} If the API request fails
 */
export const getTag = service.getOne;

/**
 * Updates an existing tag. Validates update data and checks that the tag exists first.
 * Tags use direct edit (not OCC) since they don't have concurrent editing concerns.
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
export const deleteTag = service.remove;
