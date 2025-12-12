/**
 * Validation utilities for MCP tool handlers
 * Provides explicit Zod validation to ensure input is validated at handler entry points.
 */
import { ValidationError } from '../errors/index.js';

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
    const error = ValidationError.fromZod(result.error, toolName);
    return {
      success: false,
      errorResponse: {
        content: [{ type: 'text', text: JSON.stringify(error.toJSON(), null, 2) }],
        isError: true,
      },
    };
  }
  return { success: true, data: result.data };
};
