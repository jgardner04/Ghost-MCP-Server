/**
 * Sole chokepoint for sanitizing error payloads surfaced to MCP clients.
 * Walks the envelope and replaces values that could leak credentials.
 */

const GHOST_KEY_PATTERN = /[0-9a-f]{24}:[0-9a-f]{64}/gi;
const URL_SECRET_QS_PATTERN = /([?&](?:key|token|access_token)=)[^&\s"']+/gi;
const AUTH_HEADER_PATTERN = /(Authorization|Cookie|Set-Cookie)\s*[:=]\s*[^\r\n,;]+/gi;
const REDACTED = '[REDACTED]';
const ORIGINAL_MESSAGE_MAX_BYTES = 2048;

function redactString(value, envKey) {
  if (typeof value !== 'string' || value.length === 0) return value;
  let out = value;
  if (envKey) {
    out = out.replaceAll(envKey, REDACTED);
  }
  out = out.replace(GHOST_KEY_PATTERN, REDACTED);
  out = out.replace(URL_SECRET_QS_PATTERN, `$1${REDACTED}`);
  out = out.replace(AUTH_HEADER_PATTERN, `$1: ${REDACTED}`);
  return out;
}

function truncate(value, maxBytes) {
  if (typeof value !== 'string') return value;
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  // Slice by bytes (not chars) to honour the byte limit even for multibyte content.
  return `${Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8')}…[truncated]`;
}

function walk(node, envKey, isOriginalMessage = false) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'string') {
    const redacted = redactString(node, envKey);
    return isOriginalMessage ? truncate(redacted, ORIGINAL_MESSAGE_MAX_BYTES) : redacted;
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, envKey));
  }
  if (typeof node === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(node)) {
      result[k] = walk(v, envKey, k === 'originalMessage');
    }
    return result;
  }
  return node;
}

/**
 * Deep-walks an error envelope and redacts known secret patterns.
 * Non-destructive: returns a new object; does not mutate input.
 *
 * @param {object} envelope - Error envelope object.
 * @returns {object} Sanitized envelope.
 */
export function sanitizeErrorPayload(envelope) {
  const envKey = process.env.GHOST_ADMIN_API_KEY || '';
  return walk(envelope, envKey);
}
