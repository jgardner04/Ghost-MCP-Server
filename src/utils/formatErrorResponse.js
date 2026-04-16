import { BaseError, GhostAPIError, ValidationError } from '../errors/index.js';
import { sanitizeErrorPayload } from './sanitizeErrorPayload.js';

/**
 * Builds an MCP tool error response with a consistent envelope shape.
 * All errors produce `{ error: {...} }`; GhostAPIError additionally includes
 * a gated `ghost` sub-object with Ghost-specific diagnostic fields. Callers
 * may pass an optional `extra` object whose contents will be merged into the
 * envelope under an `extra` key and sanitized alongside the rest.
 *
 * @param {Error} error - The caught error.
 * @param {string} toolName - MCP tool name for the human-readable summary line.
 * @param {object} [extra] - Optional caller-supplied context; sanitized with the envelope.
 * @returns {{content: {type: string, text: string}[], isError: true}}
 */
export function formatErrorResponse(error, toolName, extra) {
  // Duck-type ZodError so we don't couple this module to the zod runtime.
  const normalized =
    error?.name === 'ZodError' && Array.isArray(error.issues)
      ? ValidationError.fromZod(error, toolName)
      : error;

  const base =
    normalized instanceof BaseError
      ? normalized.toJSON()
      : {
          name: normalized?.name || 'Error',
          message: normalized?.message || String(normalized),
          code: 'UNKNOWN',
          statusCode: 500,
        };

  const envelope = { error: base };

  if (normalized instanceof GhostAPIError) {
    envelope.ghost = {
      operation: normalized.operation,
      statusCode: normalized.ghostStatusCode,
      // ExternalServiceError's constructor coerces originalError to a string;
      // String() handles any surprise non-string value without branching.
      originalMessage: String(normalized.originalError ?? ''),
    };
  }

  // Guard against non-object `extra`: Object.keys(string) returns per-char
  // indices and would silently set envelope.extra to that string.
  if (extra && typeof extra === 'object' && Object.keys(extra).length > 0) {
    envelope.extra = extra;
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
