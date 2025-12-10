import GhostAdminAPI from '@tryghost/admin-api';
import dotenv from 'dotenv';
import { createContextLogger } from '../utils/logger.js';

dotenv.config();

const logger = createContextLogger('ghost-service');
const { GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY } = process.env;

if (!GHOST_ADMIN_API_URL || !GHOST_ADMIN_API_KEY) {
  throw new Error('Ghost Admin API URL and Key must be provided in .env file');
}

// Configure the Ghost Admin API client
const api = new GhostAdminAPI({
  url: GHOST_ADMIN_API_URL,
  key: GHOST_ADMIN_API_KEY,
  // Specify the Ghost Admin API version
  // Check your Ghost installation for the correct version
  version: 'v5.0', // Adjust if necessary
});

/**
 * Generic handler for Ghost Admin API requests.
 * Includes basic error handling and logging.
 * @param {string} resource - The API resource (e.g., 'posts', 'tags', 'images').
 * @param {string} action - The action to perform (e.g., 'add', 'browse', 'read', 'edit', 'delete', 'upload').
 * @param {object} data - The data payload for the request (e.g., post content, image file).
 * @param {object} options - Additional options for the API call (e.g., { include: 'tags' }).
 * @param {number} retries - The number of retry attempts remaining.
 * @returns {Promise<object>} The result from the Ghost Admin API.
 */
const handleApiRequest = async (resource, action, data = {}, options = {}, retries = 3) => {
  if (!api[resource] || typeof api[resource][action] !== 'function') {
    const errorMsg = `Invalid Ghost API resource or action: ${resource}.${action}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    logger.apiRequest(`${resource}.${action}`, '', {
      retries,
      hasData: !!Object.keys(data).length,
    });
    // Log data payload carefully, avoiding sensitive info if necessary
    // logger.debug('API request payload', { resource, action, dataKeys: Object.keys(data) });

    let result;
    if (Object.keys(options).length > 0) {
      // Actions like 'add', 'edit' might take data first, then options
      // Actions like 'browse', 'read' might take options first, then data (like an ID)
      // The Ghost Admin API library structure varies slightly, this is a basic attempt
      // We might need more specific handlers if this proves too simple.
      if (action === 'add' || action === 'edit') {
        result = await api[resource][action](data, options);
      } else if (action === 'upload') {
        // Upload action has a specific signature
        result = await api[resource][action](data); // data here is { ref, file } or similar
      } else {
        // Assume options come first for browse/read/delete with identifier in data
        result = await api[resource][action](options, data);
      }
    } else {
      // If no options, just pass the data
      result = await api[resource][action](data);
    }

    logger.apiResponse(`${resource}.${action}`, '', 200, {
      resultType: typeof result,
      hasResult: !!result,
    });
    return result;
  } catch (error) {
    logger.apiError(`${resource}.${action}`, '', error);

    // Check for specific error types or status codes if available in the error object
    // The structure of `error` depends on the Ghost API client library
    const statusCode = error.response?.status; // Example: Check for Axios-like error structure
    const isRateLimit = statusCode === 429;
    const isServerError = statusCode >= 500;
    const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT'; // Example network errors

    if ((isRateLimit || isServerError || isNetworkError) && retries > 0) {
      const delay = isRateLimit ? 5000 : 1000 * (4 - retries); // Longer delay for rate limit, increasing delay for others
      logger.warn('Retrying Ghost API request', {
        resource,
        action,
        delay,
        retriesLeft: retries - 1,
        reason: isRateLimit ? 'rate_limit' : isServerError ? 'server_error' : 'network_error',
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Recursively call with decremented retries
      return handleApiRequest(resource, action, data, options, retries - 1);
    } else if (statusCode === 404) {
      logger.warn('Ghost API resource not found', {
        resource,
        action,
        id: data.id || 'N/A',
        statusCode,
      });
      // Decide how to handle 404 - maybe return null or let the error propagate
      throw error; // Or return null;
    } else {
      logger.error('Non-retryable error or out of retries', {
        resource,
        action,
        statusCode,
        error: error.message,
      });
      throw error; // Re-throw for upstream handling
    }
  }
};

// Example function (will be expanded later)
const getSiteInfo = async () => {
  return handleApiRequest('site', 'read');
  // try {
  //   const site = await api.site.read();
  //   console.log("Connected to Ghost site:", site.title);
  //   return site;
  // } catch (error) {
  //   console.error("Error connecting to Ghost Admin API:", error);
  //   throw error; // Re-throw the error for handling upstream
  // }
};

/**
 * Creates a new post in Ghost.
 * @param {object} postData - The data for the new post.
 *   Should include properties like title, html or mobiledoc, status, etc.
 * @param {object} options - Optional parameters like source: 'html'.
 * @returns {Promise<object>} The created post object.
 */
const createPost = async (postData, options = { source: 'html' }) => {
  if (!postData.title) {
    throw new Error('Post title is required.');
  }
  // Add more validation as needed (e.g., for content)

  // Default status to draft if not provided
  const dataWithDefaults = {
    status: 'draft',
    ...postData,
  };

  return handleApiRequest('posts', 'add', dataWithDefaults, options);
};

/**
 * Uploads an image to Ghost.
 * Requires the image file path.
 * @param {string} imagePath - The local path to the image file.
 * @returns {Promise<object>} The result from the image upload API call, typically includes the URL of the uploaded image.
 */
const uploadImage = async (imagePath) => {
  if (!imagePath) {
    throw new Error('Image path is required for upload.');
  }

  // The Ghost Admin API expects an object with a 'file' property containing the path
  const imageData = { file: imagePath };

  // Use the handleApiRequest function for consistency
  return handleApiRequest('images', 'upload', imageData);
};

/**
 * Creates a new tag in Ghost.
 * @param {object} tagData - Data for the new tag (e.g., { name: 'New Tag', slug: 'new-tag' }).
 * @returns {Promise<object>} The created tag object.
 */
const createTag = async (tagData) => {
  if (!tagData.name) {
    throw new Error('Tag name is required.');
  }
  // Ghost automatically generates slug if not provided, but providing is good practice
  return handleApiRequest('tags', 'add', tagData);
};

/**
 * Retrieves tags from Ghost, optionally filtering by name.
 * @param {string} [name] - Optional tag name to filter by.
 * @returns {Promise<Array<object>>} An array of tag objects.
 */
const getTags = async (name) => {
  const options = {
    limit: 'all', // Get all tags
  };

  // Safely construct filter to prevent injection
  if (name) {
    // Additional validation: only allow alphanumeric, spaces, hyphens, underscores
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
      throw new Error('Tag name contains invalid characters');
    }
    // Escape single quotes and backslashes to prevent injection
    const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    options.filter = `name:'${safeName}'`;
  }

  return handleApiRequest('tags', 'browse', {}, options);
};

// Add other content management functions here (createTag, etc.)

// Export the API client instance and any service functions
export { api, getSiteInfo, handleApiRequest, createPost, uploadImage, createTag, getTags };
