import GhostAdminAPI from '@tryghost/admin-api';
import dotenv from 'dotenv';
import {
  GhostAPIError,
  ConfigurationError,
  ValidationError,
  NotFoundError,
  ErrorHandler,
  CircuitBreaker,
  retryWithBackoff,
} from '../errors/index.js';
import { createContextLogger } from '../utils/logger.js';
import { validators } from './validators.js';

dotenv.config();

const logger = createContextLogger('ghost-service-improved');

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
 * Enhanced handler for Ghost Admin API requests with circuit breaker and retry logic.
 * Routes requests to the appropriate Ghost API method based on the action type.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'pages', 'tags')
 * @param {string} action - API action to perform ('add', 'edit', 'upload', 'browse', 'read', 'delete')
 * @param {Object} [data={}] - Request payload data
 * @param {Object} [options={}] - Additional options passed to the Ghost API (e.g., filters, includes)
 * @param {Object} [config={}] - Execution configuration
 * @param {number} [config.maxRetries=3] - Maximum number of retry attempts
 * @param {boolean} [config.useCircuitBreaker=true] - Whether to use the circuit breaker
 * @returns {Promise<Object>} The Ghost API response
 * @throws {ValidationError} If the resource or action is invalid
 * @throws {GhostAPIError} If the Ghost API returns an error after all retries
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
      logger.info('Executing Ghost API request', { operation });

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

      logger.info('Successfully executed Ghost API request', { operation });
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
        logger.info('Retrying Ghost API request', { operation, attempt, maxRetries });

        // Log circuit breaker state if relevant
        if (useCircuitBreaker) {
          const state = ghostCircuitBreaker.getState();
          logger.info('Circuit breaker state', { operation, state });
        }
      },
    });
  } catch (error) {
    logger.error('Failed to execute Ghost API request', {
      operation,
      maxRetries,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Reads a single resource by ID with 404-to-NotFoundError handling.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'tags')
 * @param {string} id - The resource ID to read
 * @param {string} label - Human-readable resource label for error messages
 * @param {Object} [options={}] - Additional options passed to the Ghost API
 * @returns {Promise<Object>} The resource object from Ghost
 * @throws {ValidationError} If the ID is missing or invalid
 * @throws {NotFoundError} If the resource is not found (404)
 * @throws {GhostAPIError} If the API request fails for other reasons
 */
async function readResource(resource, id, label, options = {}) {
  validators.requireId(id, label);
  try {
    return await handleApiRequest(resource, 'read', { id }, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError(label, id);
    }
    throw error;
  }
}

/**
 * Updates a resource using optimistic concurrency control (OCC).
 * Reads the current version first to obtain updated_at, then merges it into the edit payload.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'tags')
 * @param {string} id - The resource ID to update
 * @param {Object} updateData - Fields to update on the resource
 * @param {Object} [options={}] - Additional options passed to the Ghost API
 * @param {string} [label=resource] - Human-readable resource label for error messages
 * @returns {Promise<Object>} The updated resource object from Ghost
 * @throws {ValidationError} If the ID is missing or invalid
 * @throws {NotFoundError} If the resource is not found (404)
 * @throws {GhostAPIError} If the API request fails for other reasons
 */
async function updateWithOCC(resource, id, updateData, options = {}, label = resource) {
  const existing = await readResource(resource, id, label);
  const editData = { ...updateData, updated_at: existing.updated_at };
  try {
    return await handleApiRequest(resource, 'edit', { id, ...editData }, options);
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError(label, id);
    }
    throw error;
  }
}

/**
 * Deletes a resource by ID with 404-to-NotFoundError handling.
 * @param {string} resource - Ghost API resource name (e.g., 'posts', 'tags')
 * @param {string} id - The resource ID to delete
 * @param {string} label - Human-readable resource label for error messages
 * @returns {Promise<Object>} The Ghost API deletion response
 * @throws {ValidationError} If the ID is missing or invalid
 * @throws {NotFoundError} If the resource is not found (404)
 * @throws {GhostAPIError} If the API request fails for other reasons
 */
async function deleteResource(resource, id, label) {
  validators.requireId(id, label);
  try {
    return await handleApiRequest(resource, 'delete', { id });
  } catch (error) {
    if (error instanceof GhostAPIError && error.ghostStatusCode === 404) {
      throw new NotFoundError(label, id);
    }
    throw error;
  }
}

/**
 * Retrieves Ghost site metadata (title, version, URL).
 * @returns {Promise<Object>} Site information object
 * @throws {GhostAPIError} If the API request fails
 */
export async function getSiteInfo() {
  return handleApiRequest('site', 'read');
}

/**
 * Checks the health of the Ghost API connection and circuit breaker state.
 * @returns {Promise<Object>} Health status with site info, circuit breaker state, and timestamp
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

export { api, ghostCircuitBreaker, handleApiRequest, readResource, updateWithOCC, deleteResource };
