import { GhostAPIError, ValidationError } from '../errors/index.js';
import { handleApiRequest, readResource, updateWithOCC, deleteResource } from './ghostApiClient.js';
import { validators } from './validators.js';

/**
 * Factory that generates standard CRUD service methods for a Ghost CMS resource.
 *
 * Each domain (posts, pages, tags, etc.) shares the same structural patterns:
 * create → validate → API add → 422 mapping
 * update → requireId → optional validation → OCC edit → optional 422 mapping
 * remove → deleteResource
 * getOne → readResource
 * getList → browse with defaults → empty-array fallback
 *
 * Domain-specific behavior is injected via config hooks.
 *
 * @param {Object} config - Resource configuration
 * @param {string} config.resource - Ghost API resource name (e.g., 'posts')
 * @param {string} config.label - Human-readable label (e.g., 'Post')
 * @param {Object} [config.listDefaults] - Default options for getList (e.g., { limit: 15, include: 'tags,authors' })
 * @param {Object} [config.createDefaults] - Default data merged into create payload (e.g., { status: 'draft' })
 * @param {Object} [config.createOptions] - Default options for create API call (e.g., { source: 'html' })
 * @param {Function} [config.validateCreate] - Validation function called before create: (data) => void
 * @param {Function} [config.validateUpdate] - Validation function called before update: (id, data) => void | Promise<void>
 * @param {boolean} [config.catch422OnUpdate=false] - Whether to catch 422 errors on update and wrap as ValidationError
 * @returns {Object} Object with { create, update, remove, getOne, getList } methods
 */
export function createResourceService(config) {
  const {
    resource,
    label,
    listDefaults = { limit: 15 },
    createDefaults = {},
    createOptions = {},
    validateCreate,
    validateUpdate,
    catch422OnUpdate = false,
  } = config;

  /**
   * Creates a new resource.
   * @param {Object} data - Resource data
   * @param {Object} [options] - API request options (merged with createOptions)
   * @returns {Promise<Object>} Created resource
   */
  async function create(data, options = {}) {
    if (validateCreate) {
      validateCreate(data);
    }

    const dataWithDefaults = {
      ...createDefaults,
      ...data,
    };

    const mergedOptions = { ...createOptions, ...options };

    try {
      return await handleApiRequest(resource, 'add', dataWithDefaults, mergedOptions);
    } catch (error) {
      if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
        throw new ValidationError(`${label} creation failed due to validation errors`, [
          { field: label.toLowerCase(), message: error.originalError },
        ]);
      }
      throw error;
    }
  }

  /**
   * Updates an existing resource with optimistic concurrency control.
   * @param {string} id - Resource ID
   * @param {Object} updateData - Fields to update
   * @param {Object} [options={}] - API request options
   * @returns {Promise<Object>} Updated resource
   */
  async function update(id, updateData, options = {}) {
    validators.requireId(id, label);

    if (validateUpdate) {
      await validateUpdate(id, updateData);
    }

    if (catch422OnUpdate) {
      try {
        return await updateWithOCC(resource, id, updateData, options, label);
      } catch (error) {
        if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
          throw new ValidationError(`${label} update failed`, [
            { field: label.toLowerCase(), message: error.originalError },
          ]);
        }
        throw error;
      }
    }

    return updateWithOCC(resource, id, updateData, options, label);
  }

  /**
   * Deletes a resource by ID.
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} Deletion confirmation
   */
  async function remove(id) {
    return deleteResource(resource, id, label);
  }

  /**
   * Retrieves a single resource by ID.
   * @param {string} id - Resource ID
   * @param {Object} [options={}] - API request options
   * @returns {Promise<Object>} Resource object
   */
  async function getOne(id, options = {}) {
    return readResource(resource, id, label, options);
  }

  /**
   * Lists resources with optional filtering and pagination.
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Array>} Array of resources (empty array if none found)
   */
  async function getList(options = {}) {
    const mergedOptions = {
      ...listDefaults,
      ...options,
    };

    const result = await handleApiRequest(resource, 'browse', {}, mergedOptions);
    return result || [];
  }

  return { create, update, remove, getOne, getList };
}
