import { BaseError, GhostAPIError } from '../errors/index.js';
import { sanitizeErrorPayload } from './sanitizeErrorPayload.js';

/**
 * Builds an MCP tool error response with a consistent envelope shape.
 * All errors produce `{ error: {...} }`; GhostAPIError additionally includes
 * a gated `ghost` sub-object with Ghost-specific diagnostic fields.
 * The envelope is passed through sanitizeErrorPayload before emission.
 *
 * @param {Error} error - The caught error.
 * @param {string} toolName - MCP tool name for the human-readable summary line.
 * @returns {{content: {type: string, text: string}[], isError: true}}
 */
export function formatErrorResponse(error, toolName) {
  const base =
    error instanceof BaseError
      ? error.toJSON()
      : {
          name: error?.name || 'Error',
          message: error?.message || String(error),
          code: 'UNKNOWN',
          statusCode: 500,
        };

  const envelope = { error: base };

  if (error instanceof GhostAPIError) {
    envelope.ghost = {
      operation: error.operation,
      statusCode: error.ghostStatusCode,
      // error.originalError is already a string (coerced by ExternalServiceError constructor);
      // coerce again defensively so the sanitizer always receives a string, not an Error object.
      originalMessage:
        typeof error.originalError === 'string'
          ? error.originalError
          : (error.originalError?.message ?? String(error.originalError)),
    };
  }

  const sanitized = sanitizeErrorPayload(envelope);
  const summary = sanitized.ghost
    ? `Error in ${toolName}: ${sanitized.error.name} [${sanitized.ghost.statusCode ?? '?'} ${sanitized.error.code}] ${sanitized.ghost.operation ?? '?'}: ${sanitized.ghost.originalMessage ?? sanitized.error.message}`
    : `Error in ${toolName}: ${sanitized.error.message}`;

  const body = `${summary}\n\n\`\`\`json\n${JSON.stringify(sanitized, null, 2)}\n\`\`\``;

  return {
    content: [{ type: 'text', text: body }],
    isError: true,
  };
}
