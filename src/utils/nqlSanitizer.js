/**
 * Sanitizes a value for use in NQL (Ghost's filter query language) to prevent injection.
 * Escapes backslashes, single quotes, and double quotes.
 * @param {string} value - The value to sanitize
 * @returns {string} The sanitized value
 */
export function sanitizeNqlValue(value) {
  if (!value) return value;
  // Escape backslashes first, then quotes
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
