import GhostAdminAPI from "@tryghost/admin-api";
import dotenv from "dotenv";
import {
  GhostAPIError,
  ConfigurationError,
  ValidationError,
  NotFoundError,
  ErrorHandler,
  CircuitBreaker,
  retryWithBackoff
} from "../errors/index.js";

dotenv.config();

const { GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY } = process.env;

// Validate configuration at startup
if (!GHOST_ADMIN_API_URL || !GHOST_ADMIN_API_KEY) {
  throw new ConfigurationError(
    "Ghost Admin API configuration is incomplete",
    ["GHOST_ADMIN_API_URL", "GHOST_ADMIN_API_KEY"].filter(
      key => !process.env[key]
    )
  );
}

// Configure the Ghost Admin API client
const api = new GhostAdminAPI({
  url: GHOST_ADMIN_API_URL,
  key: GHOST_ADMIN_API_KEY,
  version: "v5.0",
});

// Circuit breaker for Ghost API
const ghostCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringPeriod: 10000 // 10 seconds
});

/**
 * Enhanced handler for Ghost Admin API requests with proper error handling
 */
const handleApiRequest = async (
  resource,
  action,
  data = {},
  options = {},
  config = {}
) => {
  // Validate inputs
  if (!api[resource] || typeof api[resource][action] !== "function") {
    throw new ValidationError(
      `Invalid Ghost API resource or action: ${resource}.${action}`
    );
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
        case "add":
        case "edit":
          result = await api[resource][action](data, options);
          break;
        case "upload":
          result = await api[resource][action](data);
          break;
        case "browse":
        case "read":
          result = await api[resource][action](options, data);
          break;
        case "delete":
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
      onRetry: (attempt, error) => {
        console.log(`Retrying ${operation} (attempt ${attempt}/${maxRetries})`);
        
        // Log circuit breaker state if relevant
        if (useCircuitBreaker) {
          const state = ghostCircuitBreaker.getState();
          console.log(`Circuit breaker state:`, state);
        }
      }
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
      errors.push({ field: 'status', message: 'Invalid status. Must be draft, published, or scheduled' });
    }
    
    if (postData.status === 'scheduled' && !postData.published_at) {
      errors.push({ field: 'published_at', message: 'published_at is required when status is scheduled' });
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
    
    if (tagData.slug && !/^[a-z0-9\-]+$/.test(tagData.slug)) {
      errors.push({ field: 'slug', message: 'Slug must contain only lowercase letters, numbers, and hyphens' });
    }
    
    if (errors.length > 0) {
      throw new ValidationError('Tag validation failed', errors);
    }
  },

  validateImagePath(imagePath) {
    if (!imagePath || typeof imagePath !== 'string') {
      throw new ValidationError('Image path is required and must be a string');
    }
    
    // Check if file exists
    const fs = await import('fs/promises');
    try {
      await fs.access(imagePath);
    } catch {
      throw new NotFoundError('Image file', imagePath);
    }
  }
};

/**
 * Service functions with enhanced error handling
 */

export async function getSiteInfo() {
  try {
    return await handleApiRequest("site", "read");
  } catch (error) {
    console.error("Failed to get site info:", error);
    throw error;
  }
}

export async function createPost(postData, options = { source: "html" }) {
  // Validate input
  validators.validatePostData(postData);
  
  // Add defaults
  const dataWithDefaults = {
    status: "draft",
    ...postData,
  };

  // Sanitize HTML content if provided
  if (dataWithDefaults.html) {
    // Basic XSS prevention - in production, use a proper sanitization library
    dataWithDefaults.html = dataWithDefaults.html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '');
  }

  try {
    return await handleApiRequest("posts", "add", dataWithDefaults, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      // Transform Ghost validation errors into our format
      throw new ValidationError('Post creation failed due to validation errors', [
        { field: 'post', message: error.originalError }
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
    const existingPost = await handleApiRequest("posts", "read", { id: postId });
    
    // Merge with existing data
    const mergedData = {
      ...existingPost,
      ...updateData,
      updated_at: existingPost.updated_at // Required for Ghost API
    };
    
    return await handleApiRequest("posts", "edit", mergedData, { id: postId, ...options });
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
    return await handleApiRequest("posts", "delete", { id: postId });
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
    return await handleApiRequest("posts", "read", { id: postId }, options);
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
    ...options
  };
  
  try {
    return await handleApiRequest("posts", "browse", {}, defaultOptions);
  } catch (error) {
    console.error("Failed to get posts:", error);
    throw error;
  }
}

export async function uploadImage(imagePath) {
  // Validate input
  await validators.validateImagePath(imagePath);
  
  const imageData = { file: imagePath };
  
  try {
    return await handleApiRequest("images", "upload", imageData);
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
    return await handleApiRequest("tags", "add", tagData);
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
        { field: 'tag', message: error.originalError }
      ]);
    }
    throw error;
  }
}

export async function getTags(name) {
  const options = {
    limit: "all",
    ...(name && { filter: `name:'${name}'` }),
  };
  
  try {
    const tags = await handleApiRequest("tags", "browse", {}, options);
    return tags || [];
  } catch (error) {
    console.error("Failed to get tags:", error);
    throw error;
  }
}

export async function getTag(tagId) {
  if (!tagId) {
    throw new ValidationError('Tag ID is required');
  }
  
  try {
    return await handleApiRequest("tags", "read", { id: tagId });
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
  
  validators.validateTagData({ name: 'dummy', ...updateData }); // Validate update data
  
  try {
    const existingTag = await getTag(tagId);
    const mergedData = {
      ...existingTag,
      ...updateData
    };
    
    return await handleApiRequest("tags", "edit", mergedData, { id: tagId });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    if (error instanceof GhostAPIError && error.ghostStatusCode === 422) {
      throw new ValidationError('Tag update failed', [
        { field: 'tag', message: error.originalError }
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
    return await handleApiRequest("tags", "delete", { id: tagId });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError('Tag', tagId);
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
        url: site.url
      },
      circuitBreaker: circuitState,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      circuitBreaker: ghostCircuitBreaker.getState(),
      timestamp: new Date().toISOString()
    };
  }
}

// Export everything including the API client for backward compatibility
export {
  api,
  handleApiRequest,
  ghostCircuitBreaker,
  validators
};

export default {
  getSiteInfo,
  createPost,
  updatePost,
  deletePost,
  getPost,
  getPosts,
  uploadImage,
  createTag,
  getTags,
  getTag,
  updateTag,
  deleteTag,
  checkHealth
};