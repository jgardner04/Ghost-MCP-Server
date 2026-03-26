import { promises as fs } from 'fs';
import { ValidationError, NotFoundError } from '../errors/index.js';

/**
 * Input validation helpers
 */
export const validators = {
  /**
   * Validates that an ID is a non-empty string. Used by CRUD helpers to enforce
   * consistent ID validation across all resource types.
   * @param {string} id - The resource ID to validate
   * @param {string} entityName - Human-readable resource name for error messages (e.g., 'Post', 'Tag')
   * @throws {ValidationError} If the ID is falsy, not a string, or empty/whitespace
   */
  requireId(id, entityName) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new ValidationError(`${entityName} ID is required`);
    }
  },

  /**
   * Validates scheduling fields for posts and pages. Ensures published_at is present
   * when status is 'scheduled' and that the date is valid and in the future.
   * @param {Object} data - The resource data containing status and/or published_at
   * @param {string} [data.status] - Resource status ('draft', 'published', 'scheduled')
   * @param {string} [data.published_at] - ISO 8601 date string for scheduling
   * @param {string} [resourceLabel='Resource'] - Human-readable label for error messages
   * @throws {ValidationError} If scheduling validation fails
   */
  validateScheduledStatus(data, resourceLabel = 'Resource') {
    const errors = [];

    if (data.status === 'scheduled' && !data.published_at) {
      errors.push({
        field: 'published_at',
        message: 'published_at is required when status is scheduled',
      });
    }

    if (data.published_at) {
      const publishDate = new Date(data.published_at);
      if (isNaN(publishDate.getTime())) {
        errors.push({ field: 'published_at', message: 'Invalid date format' });
      } else if (data.status === 'scheduled' && publishDate <= new Date()) {
        errors.push({ field: 'published_at', message: 'Scheduled date must be in the future' });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`${resourceLabel} validation failed`, errors);
    }
  },

  /**
   * Validates post creation data. Requires a title and either html or mobiledoc content.
   * Also validates status values and delegates to validateScheduledStatus for scheduling.
   * @param {Object} postData - The post data to validate
   * @param {string} postData.title - Post title (required, non-empty)
   * @param {string} [postData.html] - HTML content (required if mobiledoc not provided)
   * @param {string} [postData.mobiledoc] - Mobiledoc content (required if html not provided)
   * @param {string} [postData.status] - Post status ('draft', 'published', 'scheduled')
   * @param {string} [postData.published_at] - ISO 8601 date for scheduled posts
   * @throws {ValidationError} If validation fails
   */
  validatePostData(postData) {
    const errors = [];

    if (!postData.title || postData.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title is required' });
    }

    if (!postData.html && !postData.mobiledoc) {
      errors.push({ field: 'content', message: 'Either html or mobiledoc content is required' });
    }

    if (postData.status && !['draft', 'published', 'scheduled'].includes(postData.status)) {
      errors.push({
        field: 'status',
        message: 'Invalid status. Must be draft, published, or scheduled',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Post validation failed', errors);
    }

    this.validateScheduledStatus(postData, 'Post');
  },

  /**
   * Validates tag creation data. Requires a non-empty name and validates slug format.
   * @param {Object} tagData - The tag data to validate
   * @param {string} tagData.name - Tag name (required, non-empty)
   * @param {string} [tagData.slug] - Tag slug (lowercase letters, numbers, hyphens only)
   * @throws {ValidationError} If validation fails
   */
  validateTagData(tagData) {
    const errors = [];

    if (!tagData.name || tagData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Tag name is required' });
    }

    if (tagData.slug && !/^[a-z0-9-]+$/.test(tagData.slug)) {
      errors.push({
        field: 'slug',
        message: 'Slug must contain only lowercase letters, numbers, and hyphens',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Tag validation failed', errors);
    }
  },

  /**
   * Validates tag update data. Name is optional but cannot be empty if provided.
   * Validates slug format if provided.
   * @param {Object} updateData - The tag update data to validate
   * @param {string} [updateData.name] - Tag name (cannot be empty if provided)
   * @param {string} [updateData.slug] - Tag slug (lowercase letters, numbers, hyphens only)
   * @throws {ValidationError} If validation fails
   */
  validateTagUpdateData(updateData) {
    const errors = [];

    // Name is optional in updates, but if provided, it cannot be empty
    if (updateData.name !== undefined && updateData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Tag name cannot be empty' });
    }

    // Validate slug format if provided
    if (updateData.slug && !/^[a-z0-9-]+$/.test(updateData.slug)) {
      errors.push({
        field: 'slug',
        message: 'Slug must contain only lowercase letters, numbers, and hyphens',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Tag update validation failed', errors);
    }
  },

  /**
   * Validates that an image path is a non-empty string and that the file exists on disk.
   * @param {string} imagePath - Absolute path to the image file
   * @returns {Promise<void>}
   * @throws {ValidationError} If imagePath is falsy or not a string
   * @throws {NotFoundError} If the file does not exist at the given path
   */
  async validateImagePath(imagePath) {
    if (!imagePath || typeof imagePath !== 'string') {
      throw new ValidationError('Image path is required and must be a string');
    }

    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch {
      throw new NotFoundError('Image file', imagePath);
    }
  },

  /**
   * Validates page creation data. Requires a title and either html or mobiledoc content.
   * Also validates status values and delegates to validateScheduledStatus for scheduling.
   * @param {Object} pageData - The page data to validate
   * @param {string} pageData.title - Page title (required, non-empty)
   * @param {string} [pageData.html] - HTML content (required if mobiledoc not provided)
   * @param {string} [pageData.mobiledoc] - Mobiledoc content (required if html not provided)
   * @param {string} [pageData.status] - Page status ('draft', 'published', 'scheduled')
   * @param {string} [pageData.published_at] - ISO 8601 date for scheduled pages
   * @throws {ValidationError} If validation fails
   */
  validatePageData(pageData) {
    const errors = [];

    if (!pageData.title || pageData.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title is required' });
    }

    if (!pageData.html && !pageData.mobiledoc) {
      errors.push({ field: 'content', message: 'Either html or mobiledoc content is required' });
    }

    if (pageData.status && !['draft', 'published', 'scheduled'].includes(pageData.status)) {
      errors.push({
        field: 'status',
        message: 'Invalid status. Must be draft, published, or scheduled',
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Page validation failed', errors);
    }

    this.validateScheduledStatus(pageData, 'Page');
  },

  /**
   * Validates newsletter creation data. Requires a non-empty name.
   * @param {Object} newsletterData - The newsletter data to validate
   * @param {string} newsletterData.name - Newsletter name (required, non-empty)
   * @throws {ValidationError} If validation fails
   */
  validateNewsletterData(newsletterData) {
    const errors = [];

    if (!newsletterData.name || newsletterData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Newsletter name is required' });
    }

    if (errors.length > 0) {
      throw new ValidationError('Newsletter validation failed', errors);
    }
  },
};
