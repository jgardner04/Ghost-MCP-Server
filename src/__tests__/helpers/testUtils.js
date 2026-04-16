import { expect, vi } from 'vitest';

/**
 * Asserts that a value is a ZodObject exposing a `.shape` property.
 *
 * Uses `expect` so Vitest reports a clean named assertion failure, and
 * `schema?.shape` so a null/undefined `schema` is handled without a secondary
 * TypeError — the exact opaque failure mode this helper eliminates.
 *
 * @param {unknown} schema - Value expected to be a ZodObject
 * @param {string} toolName - Tool name included in the failure message
 */
export function assertZodShape(schema, toolName) {
  expect(schema?.shape, `${toolName}: schema is not a ZodObject (missing .shape)`).toBeDefined();
}

/**
 * Creates a mock environment variable configuration.
 *
 * @param {Object} env - Environment variables to set
 * @returns {Object} Mock dotenv module
 *
 * @example
 * import { mockEnv } from '../helpers/testUtils.js';
 *
 * vi.mock('dotenv', () => mockEnv({
 *   GHOST_ADMIN_API_URL: 'https://test.ghost.io',
 *   GHOST_ADMIN_API_KEY: 'test-key',
 * }));
 */
export function mockEnv(env = {}) {
  // Set environment variables
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return {
    default: {
      config: vi.fn(),
    },
  };
}

/**
 * Cleans up environment variables after tests.
 *
 * @param {string[]} keys - Array of environment variable keys to remove
 *
 * @example
 * import { cleanupEnv } from '../helpers/testUtils.js';
 *
 * afterEach(() => {
 *   cleanupEnv(['GHOST_ADMIN_API_URL', 'GHOST_ADMIN_API_KEY']);
 * });
 */
export function cleanupEnv(keys) {
  keys.forEach((key) => {
    delete process.env[key];
  });
}

/**
 * Creates a mock dotenv module for use with vi.mock().
 *
 * @returns {Object} Mock dotenv module
 *
 * @example
 * import { mockDotenv } from '../helpers/testUtils.js';
 *
 * vi.mock('dotenv', () => mockDotenv());
 */
export function mockDotenv() {
  return {
    default: {
      config: vi.fn(),
    },
  };
}

/**
 * Waits for a condition to be true or times out.
 *
 * @param {Function} condition - Function that returns true when condition is met
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>} True if condition met, false if timeout
 *
 * @example
 * import { waitFor } from '../helpers/testUtils.js';
 *
 * await waitFor(() => mockFn.mock.calls.length > 0, 1000, 100);
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Creates a promise that resolves after a specified delay.
 *
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 *
 * @example
 * import { delay } from '../helpers/testUtils.js';
 *
 * await delay(1000); // Wait 1 second
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asserts that a promise rejects with a specific error type and message.
 * Combines the common double `.rejects` pattern into a single call.
 *
 * @param {Promise} promise - The promise expected to reject
 * @param {Function} ErrorClass - The expected error constructor (e.g., NotFoundError)
 * @param {string|RegExp} message - The expected error message (string or regex)
 *
 * @example
 * import { expectRejection } from '../helpers/testUtils.js';
 *
 * await expectRejection(
 *   updateMember('non-existent', { name: 'Test' }),
 *   NotFoundError,
 *   'Member not found'
 * );
 */
export async function expectRejection(promise, ErrorClass, message) {
  await expect(promise).rejects.toBeInstanceOf(ErrorClass);
  await expect(promise).rejects.toThrow(message);
}
