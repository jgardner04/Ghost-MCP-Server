import GhostAdminAPI from '@tryghost/admin-api';
import sanitizeHtml from 'sanitize-html';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import {
  GhostAPIError,
  ConfigurationError,
  ValidationError,
  NotFoundError,
  ErrorHandler,
  CircuitBreaker,
  retryWithBackoff,
} from '../errors/index.js';

dotenv.config();

const { GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY } = process.env;

// Validate configuration at startup
if (!GHOST_ADMIN_API_URL || !GHOST_ADMIN_API_KEY) {
  throw new ConfigurationError(
    'Ghost Admin API configuration is incomplete',
    ['GHOST_ADMIN_API_URL', 'GHOST_ADMIN_API_KEY'].filter((key) => !process.env[key])
  );
}

// Configure the Ghost Admin API client
const api = new GhostAdminAPI({
  url: GHOST_ADMIN_API_URL,
  key: GHOST_ADMIN_API_KEY,
  version: 'v5.0',
});

// Circuit breaker for Ghost API
const ghostCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringPeriod: 10000, // 10 seconds
});

/**
 * Enhanced handler for Ghost Admin API requests with proper error handling
 */
const handleApiRequest = async (resource, action, data = {}, options = {}, config = {}) => {
  // Validate inputs
  if (!api[resource] || typeof api[resource][action] !== 'function') {
    throw new ValidationError(`Invalid Ghost API resource or action: ${resource}.${action}`);
  }

  const operation = `${resource}.${action}`;
  const maxRetries = config.maxRetries ?? 3;
  const useCircuitBreaker = config.useCircuitBreaker ?? true;

  // Main execution function
  const executeRequest = async () => {
    try {
      console.log(`Executing Ghost API request: ${operation}`);

      let result;

      // Handle different action signatures
      switch (action) {
        case 'add':
        case 'edit':
          result = await api[resource][action](data, options);
          break;
        case 'upload':
          result = await api[resource][action](data);
          break;
        case 'browse':
        case 'read':
          result = await api[resource][action](options, data);
          break;
        case 'delete':
          result = await api[resource][action](data.id || data, options);
          break;
        default:
          result = await api[resource][action](data);
      }

      console.log(`Successfully executed Ghost API request: ${operation}`);
      return result;
    } catch (error) {
      // Transform Ghost API errors into our error types
      throw ErrorHandler.fromGhostError(error, operation);
    }
  };

  // Wrap with circuit breaker if enabled
  const wrappedExecute = useCircuitBreaker
    ? () => ghostCircuitBreaker.execute(executeRequest)
    : executeRequest;

  // Execute with retry logic
  try {
    return await retryWithBackoff(wrappedExecute, {
      maxAttempts: maxRetries,
      onRetry: (attempt, _error) => {
        console.log(`Retrying ${operation} (attempt ${attempt}/${maxRetries})`);

        // Log circuit breaker state if relevant
        if (useCircuitBreaker) {
          const state = ghostCircuitBreaker.getState();
          console.log(`Circuit breaker state:`, state);
        }
      },
    });
  } catch (error) {
    console.error(`Failed to execute ${operation} after ${maxRetries} attempts:`, error.message);
    throw error;
  }
};

/**
 * Input validation helpers
 */
const validators = {
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

    if (postData.status === 'scheduled' && !postData.published_at) {
      errors.push({
        field: 'published_at',
        message: 'published_at is required when status is scheduled',
      });
    }

    if (postData.published_at) {
      const publishDate = new Date(postData.published_at);
      if (isNaN(publishDate.getTime())) {
        errors.push({ field: 'published_at', message: 'Invalid date format' });
      } else if (postData.status === 'scheduled' && publishDate <= new Date()) {
        errors.push({ field: 'published_at', message: 'Scheduled date must be in the future' });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Post validation failed', errors);
    }
  },

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

    if (pageData.status === 'scheduled' && !pageData.published_at) {
      errors.push({
        field: 'published_at',
        message: 'published_at is required when status is scheduled',
      });
    }

    if (pageData.published_at) {
      const publishDate = new Date(pageData.published_at);
      if (isNaN(publishDate.getTime())) {
        errors.push({ field: 'published_at', message: 'Invalid date format' });
      } else if (pageData.status === 'scheduled' && publishDate <= new Date()) {
        errors.push({ field: 'published_at', message: 'Scheduled date must be in the future' });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Page validation failed', errors);
    }
  },

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

/**
 * Service functions with enhanced error handling
 */

export async function getSiteInfo() {
  try {
    return await handleApiRequest('site', 'read');
  } catch (error) {
    console.error('Failed to get site info:', error);
    throw error;
  }
}

export async function createPost(postData, options = { source: 'html' }) {
  // Validate input
  validators.validatePostData(postData);

  // Add defaults
  const dataWithDefaults = {
    status: 'draft',
    ...postData,
  };

  // Sanitize HTML content if provided
  if (dataWithDefaults.html) {
    // Use proper HTML sanitization library to prevent XSS
    dataWithDefaults.html = sanitizeHtml(dataWithDefaults.html, {
      allowedTags: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'p',
        'a',
        'ul',
        'ol',
        'nl',
        'li',
        'b',
        'i',
        'strong',
        'em',
        'strike',
        'code',
        'hr',
        'br',
        'div',
        'span',
        'img',
        'pre',
      ],
      allowedAttributes: {
        a: ['href', 'title'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        '*': ['class', 'id'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: {
        img: ['http', 'https', 'data'],
      },
    });
  }

  try {
    return await handleApiRequest('posts', 'add', dataWithDefaults, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      // Transform Ghost validation errors into our format
      throw new ValidationError('Post creation failed due to validation errors', [
        { field: 'post', message: error.originalError },
      ]);
    }
    throw error;
  }
}

export async function updatePost(postId, updateData, options = {}) {
  if (!postId) {
    throw new ValidationError('Post ID is required for update');
  }

  // Get the current post first to ensure it exists
  try {
    const existingPost = await handleApiRequest('posts', 'read', { id: postId });

    // Merge with existing data
    const mergedData = {
      ...existingPost,
      ...updateData,
      updated_at: existingPost.updated_at, // Required for Ghost API
    };

    return await handleApiRequest('posts', 'edit', mergedData, { id: postId, ...options });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Post', postId);
    }
    throw error;
  }
}

export async function deletePost(postId) {
  if (!postId) {
    throw new ValidationError('Post ID is required for deletion');
  }

  try {
    return await handleApiRequest('posts', 'delete', { id: postId });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Post', postId);
    }
    throw error;
  }
}

export async function getPost(postId, options = {}) {
  if (!postId) {
    throw new ValidationError('Post ID is required');
  }

  try {
    return await handleApiRequest('posts', 'read', { id: postId }, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Post', postId);
    }
    throw error;
  }
}

export async function getPosts(options = {}) {
  const defaultOptions = {
    limit: 15,
    include: 'tags,authors',
    ...options,
  };

  try {
    return await handleApiRequest('posts', 'browse', {}, defaultOptions);
  } catch (error) {
    console.error('Failed to get posts:', error);
    throw error;
  }
}

export async function searchPosts(query, options = {}) {
  // Validate query
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }

  // Sanitize query - escape special NQL characters to prevent injection
  const sanitizedQuery = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // Build filter with fuzzy title match using Ghost NQL
  const filterParts = [`title:~'${sanitizedQuery}'`];

  // Add status filter if provided and not 'all'
  if (options.status && options.status !== 'all') {
    filterParts.push(`status:${options.status}`);
  }

  const searchOptions = {
    limit: options.limit || 15,
    include: 'tags,authors',
    filter: filterParts.join('+'),
  };

  try {
    return await handleApiRequest('posts', 'browse', {}, searchOptions);
  } catch (error) {
    console.error('Failed to search posts:', error);
    throw error;
  }
}

/**
 * Page CRUD Operations
 * Pages are similar to posts but do NOT support tags
 */

export async function createPage(pageData, options = { source: 'html' }) {
  // Validate input
  validators.validatePageData(pageData);

  // Add defaults
  const dataWithDefaults = {
    status: 'draft',
    ...pageData,
  };

  // Sanitize HTML content if provided (use same sanitization as posts)
  if (dataWithDefaults.html) {
    dataWithDefaults.html = sanitizeHtml(dataWithDefaults.html, {
      allowedTags: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'p',
        'a',
        'ul',
        'ol',
        'nl',
        'li',
        'b',
        'i',
        'strong',
        'em',
        'strike',
        'code',
        'hr',
        'br',
        'div',
        'span',
        'img',
        'pre',
      ],
      allowedAttributes: {
        a: ['href', 'title'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        '*': ['class', 'id'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: {
        img: ['http', 'https', 'data'],
      },
    });
  }

  try {
    return await handleApiRequest('pages', 'add', dataWithDefaults, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Page creation failed due to validation errors', [
        { field: 'page', message: error.originalError },
      ]);
    }
    throw error;
  }
}

export async function updatePage(pageId, updateData, options = {}) {
  if (!pageId) {
    throw new ValidationError('Page ID is required for update');
  }

  // Sanitize HTML if being updated
  if (updateData.html) {
    updateData.html = sanitizeHtml(updateData.html, {
      allowedTags: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'p',
        'a',
        'ul',
        'ol',
        'nl',
        'li',
        'b',
        'i',
        'strong',
        'em',
        'strike',
        'code',
        'hr',
        'br',
        'div',
        'span',
        'img',
        'pre',
      ],
      allowedAttributes: {
        a: ['href', 'title'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        '*': ['class', 'id'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: {
        img: ['http', 'https', 'data'],
      },
    });
  }

  try {
    // Get existing page to retrieve updated_at for conflict resolution
    const existingPage = await handleApiRequest('pages', 'read', { id: pageId });

    // Merge existing data with updates, preserving updated_at
    const mergedData = {
      ...existingPage,
      ...updateData,
      updated_at: existingPage.updated_at,
    };

    return await handleApiRequest('pages', 'edit', mergedData, { id: pageId, ...options });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Page', pageId);
    }
    throw error;
  }
}

export async function deletePage(pageId) {
  if (!pageId) {
    throw new ValidationError('Page ID is required for delete');
  }

  try {
    return await handleApiRequest('pages', 'delete', { id: pageId });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Page', pageId);
    }
    throw error;
  }
}

export async function getPage(pageId, options = {}) {
  if (!pageId) {
    throw new ValidationError('Page ID is required');
  }

  try {
    return await handleApiRequest('pages', 'read', { id: pageId }, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Page', pageId);
    }
    throw error;
  }
}

export async function getPages(options = {}) {
  const defaultOptions = {
    limit: 15,
    include: 'authors',
    ...options,
  };

  try {
    return await handleApiRequest('pages', 'browse', {}, defaultOptions);
  } catch (error) {
    console.error('Failed to get pages:', error);
    throw error;
  }
}

export async function searchPages(query, options = {}) {
  // Validate query
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }

  // Sanitize query - escape special NQL characters to prevent injection
  const sanitizedQuery = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // Build filter with fuzzy title match using Ghost NQL
  const filterParts = [`title:~'${sanitizedQuery}'`];

  // Add status filter if provided and not 'all'
  if (options.status && options.status !== 'all') {
    filterParts.push(`status:${options.status}`);
  }

  const searchOptions = {
    limit: options.limit || 15,
    include: 'authors',
    filter: filterParts.join('+'),
  };

  try {
    return await handleApiRequest('pages', 'browse', {}, searchOptions);
  } catch (error) {
    console.error('Failed to search pages:', error);
    throw error;
  }
}

export async function uploadImage(imagePath) {
  // Validate input
  await validators.validateImagePath(imagePath);

  const imageData = { file: imagePath };

  try {
    return await handleApiRequest('images', 'upload', imageData);
  } catch (error) {
    if (error instanceof GhostAPIError) {
      throw new ValidationError(`Image upload failed: ${error.originalError}`);
    }
    throw error;
  }
}

export async function createTag(tagData) {
  // Validate input
  validators.validateTagData(tagData);

  // Auto-generate slug if not provided
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
      // Check if it's a duplicate tag error
      if (error.originalError.includes('already exists')) {
        // Try to fetch the existing tag
        const existingTags = await getTags(tagData.name);
        if (existingTags.length > 0) {
          return existingTags[0]; // Return existing tag instead of failing
        }
      }
      throw new ValidationError('Tag creation failed', [
        { field: 'tag', message: error.originalError },
      ]);
    }
    throw error;
  }
}

export async function getTags(name) {
  const options = {
    limit: 'all',
    ...(name && { filter: `name:'${name}'` }),
  };

  try {
    const tags = await handleApiRequest('tags', 'browse', {}, options);
    return tags || [];
  } catch (error) {
    console.error('Failed to get tags:', error);
    throw error;
  }
}

export async function getTag(tagId, options = {}) {
  if (!tagId) {
    throw new ValidationError('Tag ID is required');
  }

  try {
    return await handleApiRequest('tags', 'read', { id: tagId }, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Tag', tagId);
    }
    throw error;
  }
}

export async function updateTag(tagId, updateData) {
  if (!tagId) {
    throw new ValidationError('Tag ID is required for update');
  }

  validators.validateTagUpdateData(updateData); // Validate update data

  try {
    const existingTag = await getTag(tagId);
    const mergedData = {
      ...existingTag,
      ...updateData,
    };

    return await handleApiRequest('tags', 'edit', mergedData, { id: tagId });
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

export async function deleteTag(tagId) {
  if (!tagId) {
    throw new ValidationError('Tag ID is required for deletion');
  }

  try {
    return await handleApiRequest('tags', 'delete', { id: tagId });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Tag', tagId);
    }
    throw error;
  }
}

/**
 * Member CRUD Operations
 * Members represent subscribers/users in Ghost CMS
 */

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
  // Import and validate input
  const { validateMemberData } = await import('./memberService.js');
  validateMemberData(memberData);

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
  if (!memberId) {
    throw new ValidationError('Member ID is required for update');
  }

  // Import and validate update data
  const { validateMemberUpdateData } = await import('./memberService.js');
  validateMemberUpdateData(updateData);

  try {
    // Get existing member to retrieve updated_at for conflict resolution
    const existingMember = await handleApiRequest('members', 'read', { id: memberId });

    // Merge existing data with updates, preserving updated_at
    const mergedData = {
      ...existingMember,
      ...updateData,
      updated_at: existingMember.updated_at,
    };

    return await handleApiRequest('members', 'edit', mergedData, { id: memberId, ...options });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Member', memberId);
    }
    throw error;
  }
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
  if (!memberId) {
    throw new ValidationError('Member ID is required for deletion');
  }

  try {
    return await handleApiRequest('members', 'delete', { id: memberId });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Member', memberId);
    }
    throw error;
  }
}

/**
 * Newsletter CRUD Operations
 */

export async function getNewsletters(options = {}) {
  const defaultOptions = {
    limit: 'all',
    ...options,
  };

  try {
    const newsletters = await handleApiRequest('newsletters', 'browse', {}, defaultOptions);
    return newsletters || [];
  } catch (error) {
    console.error('Failed to get newsletters:', error);
    throw error;
  }
}

export async function getNewsletter(newsletterId) {
  if (!newsletterId) {
    throw new ValidationError('Newsletter ID is required');
  }

  try {
    return await handleApiRequest('newsletters', 'read', { id: newsletterId });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Newsletter', newsletterId);
    }
    throw error;
  }
}

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

export async function updateNewsletter(newsletterId, updateData) {
  if (!newsletterId) {
    throw new ValidationError('Newsletter ID is required for update');
  }

  try {
    // Get existing newsletter to retrieve updated_at for conflict resolution
    const existingNewsletter = await handleApiRequest('newsletters', 'read', {
      id: newsletterId,
    });

    // Merge existing data with updates, preserving updated_at
    const mergedData = {
      ...existingNewsletter,
      ...updateData,
      updated_at: existingNewsletter.updated_at,
    };

    return await handleApiRequest('newsletters', 'edit', mergedData, { id: newsletterId });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Newsletter', newsletterId);
    }
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Newsletter update failed', [
        { field: 'newsletter', message: error.originalError },
      ]);
    }
    throw error;
  }
}

export async function deleteNewsletter(newsletterId) {
  if (!newsletterId) {
    throw new ValidationError('Newsletter ID is required for deletion');
  }

  try {
    return await handleApiRequest('newsletters', 'delete', newsletterId);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Newsletter', newsletterId);
    }
    throw error;
  }
}

/**
 * Health check for Ghost API connection
 */
export async function checkHealth() {
  try {
    const site = await getSiteInfo();
    const circuitState = ghostCircuitBreaker.getState();

    return {
      status: 'healthy',
      site: {
        title: site.title,
        version: site.version,
        url: site.url,
      },
      circuitBreaker: circuitState,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      circuitBreaker: ghostCircuitBreaker.getState(),
      timestamp: new Date().toISOString(),
    };
  }
}

// Export everything including the API client for backward compatibility
export { api, handleApiRequest, ghostCircuitBreaker, validators };

export default {
  getSiteInfo,
  createPost,
  updatePost,
  deletePost,
  getPost,
  getPosts,
  searchPosts,
  createPage,
  updatePage,
  deletePage,
  getPage,
  getPages,
  searchPages,
  uploadImage,
  createTag,
  getTags,
  getTag,
  updateTag,
  deleteTag,
  createMember,
  updateMember,
  deleteMember,
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
  checkHealth,
};
