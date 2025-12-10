import { vi } from 'vitest';

/**
 * Creates a mock Ghost Admin API instance with configurable behavior.
 *
 * @param {Object} options - Configuration options for the mock
 * @param {Object} options.posts - Mock implementations for posts methods
 * @param {Object} options.tags - Mock implementations for tags methods
 * @param {Object} options.site - Mock implementations for site methods
 * @param {Object} options.images - Mock implementations for images methods
 * @returns {Object} Mock Ghost Admin API instance
 *
 * @example
 * import { createMockGhostApi } from '../helpers/mockGhostApi.js';
 *
 * const api = createMockGhostApi({
 *   posts: {
 *     add: vi.fn().mockResolvedValue({ id: '1', title: 'Test Post' }),
 *   },
 *   tags: {
 *     browse: vi.fn().mockResolvedValue([{ id: '1', name: 'Test Tag' }]),
 *   },
 * });
 */
export function createMockGhostApi(options = {}) {
  return {
    posts: {
      add: vi.fn(),
      browse: vi.fn(),
      read: vi.fn(),
      edit: vi.fn(),
      delete: vi.fn(),
      ...options.posts,
    },
    tags: {
      add: vi.fn(),
      browse: vi.fn(),
      read: vi.fn(),
      edit: vi.fn(),
      delete: vi.fn(),
      ...options.tags,
    },
    site: {
      read: vi.fn(),
      ...options.site,
    },
    images: {
      upload: vi.fn(),
      ...options.images,
    },
  };
}

/**
 * Creates a mock Ghost Admin API constructor for use with vi.mock().
 *
 * @param {Object} defaultOptions - Default configuration for all instances
 * @returns {Function} Mock constructor function
 *
 * @example
 * import { createMockGhostApiConstructor } from '../helpers/mockGhostApi.js';
 *
 * vi.mock('@tryghost/admin-api', () => ({
 *   default: createMockGhostApiConstructor({
 *     posts: {
 *       add: vi.fn().mockResolvedValue({ id: '1', title: 'Test Post' }),
 *     },
 *   }),
 * }));
 */
export function createMockGhostApiConstructor(defaultOptions = {}) {
  return vi.fn(function () {
    return createMockGhostApi(defaultOptions);
  });
}

/**
 * Creates a default mock Ghost Admin API module for vi.mock().
 *
 * @param {Object} options - Configuration options for the mock API
 * @returns {Object} Mock module with default export
 *
 * @example
 * import { mockGhostApiModule } from '../helpers/mockGhostApi.js';
 *
 * vi.mock('@tryghost/admin-api', () => mockGhostApiModule());
 */
export function mockGhostApiModule(options = {}) {
  return {
    default: createMockGhostApiConstructor(options),
  };
}
