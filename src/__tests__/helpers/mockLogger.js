import { vi } from 'vitest';

/**
 * Creates a mock logger instance with spy functions for testing.
 *
 * @returns {Object} Mock logger with common logging methods
 *
 * @example
 * import { createMockLogger } from '../helpers/mockLogger.js';
 *
 * const logger = createMockLogger();
 * logger.info('test message');
 * expect(logger.info).toHaveBeenCalledWith('test message');
 */
export function createMockLogger() {
  return {
    apiRequest: vi.fn(),
    apiResponse: vi.fn(),
    apiError: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Creates a mock context logger factory that returns a mock logger.
 *
 * @returns {Function} Mock createContextLogger function
 *
 * @example
 * import { createMockContextLogger } from '../helpers/mockLogger.js';
 *
 * vi.mock('../../utils/logger.js', () => ({
 *   createContextLogger: createMockContextLogger(),
 * }));
 */
export function createMockContextLogger() {
  return vi.fn(() => createMockLogger());
}
