import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const MAX_BASE64_BYTES = 5 * 1024 * 1024; // 5 MB decoded — respects MCP transport limits

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/vnd.microsoft.icon': '.ico',
  'image/x-icon': '.ico',
};

/**
 * Resolve a caller-supplied local image path against `GHOST_MCP_IMAGE_ROOT`.
 *
 * Local-file input is *opt-in*: without the env var set, this function
 * refuses every path. That prevents a compromised MCP client from reading
 * arbitrary files via the upload tool. When set, the path must:
 *   - resolve inside the root,
 *   - exist,
 *   - not be a symlink that escapes the root.
 *
 * @param {string} inputPath - Absolute or relative path supplied by caller.
 * @returns {Promise<string>} Absolute real path to the image file.
 */
export async function resolveLocalImagePath(inputPath) {
  const root = process.env.GHOST_MCP_IMAGE_ROOT;
  if (!root) {
    throw new Error(
      'imagePath input is disabled: GHOST_MCP_IMAGE_ROOT is not set. ' +
        'Set it to the directory from which local uploads are allowed.'
    );
  }
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    throw new Error('imagePath must be a non-empty string');
  }

  // Canonicalize the root too — on macOS `/var` resolves to `/private/var`
  // via realpath, which would otherwise cause false symlink-escape errors.
  let canonicalRoot;
  try {
    canonicalRoot = await fs.realpath(path.resolve(root));
  } catch {
    throw new Error(`GHOST_MCP_IMAGE_ROOT does not exist: ${root}`);
  }

  const resolved = path.resolve(inputPath);
  // First check the textual path — catches `..` traversal before any FS I/O.
  const resolvedStart = path.resolve(root);
  const textuallyInside =
    resolved === resolvedStart || resolved.startsWith(resolvedStart + path.sep);
  if (!textuallyInside) {
    throw new Error(`imagePath is outside the allowed root (${canonicalRoot})`);
  }

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error(`imagePath does not exist: ${resolved}`);
  }
  if (!stat.isFile()) {
    throw new Error(`imagePath is not a regular file: ${resolved}`);
  }

  // Resolve symlinks and re-check containment against the canonical root.
  const realPath = await fs.realpath(resolved);
  const realInside = realPath === canonicalRoot || realPath.startsWith(canonicalRoot + path.sep);
  if (!realInside) {
    throw new Error(`imagePath symlink escapes the allowed root (${canonicalRoot})`);
  }

  return realPath;
}

/**
 * Decode a base64-encoded image to a fresh temp file.
 *
 * Accepts either a bare base64 string or a full `data:<mime>;base64,<data>`
 * URI. Caps the decoded payload at MAX_BASE64_BYTES to respect MCP
 * JSON-RPC transport limits — base64 payloads are inline in the tool
 * call, and stdio transports choke on very large frames.
 *
 * @param {string} base64 - Raw base64 or data URI.
 * @param {string} mimeType - MIME type (used to pick the temp file extension).
 * @returns {Promise<string>} Absolute path to the decoded temp file.
 */
export async function decodeBase64ToTempFile(base64, mimeType) {
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error('imageBase64 must be a non-empty string');
  }
  const ext = EXT_BY_MIME[(mimeType || '').toLowerCase()];
  if (!ext) {
    throw new Error(
      `Unsupported mimeType: ${mimeType}. Allowed: ${Object.keys(EXT_BY_MIME).join(', ')}`
    );
  }

  // Strip optional "data:<mime>;base64," prefix.
  const payload = base64.startsWith('data:') ? base64.split(',', 2)[1] : base64;
  if (!payload) throw new Error('Invalid base64 payload');

  // Reject obviously non-base64 input cheaply before allocating.
  if (!/^[A-Za-z0-9+/=\s]+$/.test(payload)) {
    throw new Error('Invalid base64 input');
  }

  const buf = Buffer.from(payload, 'base64');
  if (buf.length === 0) {
    throw new Error('Invalid base64 input');
  }
  if (buf.length > MAX_BASE64_BYTES) {
    throw new Error(
      `imageBase64 decoded size (${buf.length} bytes) exceeds the 5MB limit for MCP transport`
    );
  }

  const outPath = path.join(os.tmpdir(), `mcp-b64-${crypto.randomUUID()}${ext}`);
  await fs.writeFile(outPath, buf);
  return outPath;
}
