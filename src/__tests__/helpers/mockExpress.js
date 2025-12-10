import { vi } from 'vitest';

/**
 * Mock helpers for Express req, res, next
 * Used in controller tests
 */

/**
 * Creates a mock Express request object
 * @param {Object} options - Request options
 * @param {Object} options.query - Query parameters
 * @param {Object} options.body - Request body
 * @param {Object} options.params - Route parameters
 * @returns {Object} Mock request object
 */
export const createMockRequest = ({ query = {}, body = {}, params = {} } = {}) => ({
  query,
  body,
  params,
});

/**
 * Creates a mock Express response object
 * @returns {Object} Mock response object with spied methods
 */
export const createMockResponse = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

/**
 * Creates a mock Express next function
 * @returns {Function} Mock next function
 */
export const createMockNext = () => vi.fn();
