/**
 * Validation utilities for MCP tool handlers
 * Provides explicit Zod validation to ensure input is validated at handler entry points.
 */
import { formatErrorResponse } from './formatErrorResponse.js';

/**
 * Validates tool input against a Zod schema and returns a structured result.
 *
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against
 * @param {unknown} input - The raw input to validate
 * @param {string} toolName - The tool name for error context
 * @returns {{ success: true, data: unknown } | { success: false, errorResponse: object }}
 */
export const validateToolInput = (schema, input, toolName) => {
  const result = schema.safeParse(input);
  if (!result.success) {
    // formatErrorResponse duck-types ZodError and coerces it to ValidationError,
    // so pass the raw ZodError through — it owns the single coercion path.
    return {
      success: false,
      errorResponse: formatErrorResponse(result.error, toolName),
    };
  }
  return { success: true, data: result.data };
};
