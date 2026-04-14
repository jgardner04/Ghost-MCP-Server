import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import {
  resolveLocalImagePath,
  decodeBase64ToTempFile,
  MAX_BASE64_BYTES,
} from '../imageInputResolver.js';

const tmpRoot = path.join(os.tmpdir(), `img-resolver-${Date.now()}`);
const allowedRoot = path.join(tmpRoot, 'allowed');
const outside = path.join(tmpRoot, 'outside');

beforeAll(async () => {
  await fs.mkdir(allowedRoot, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(allowedRoot, 'ok.png'), 'fake-png');
  await fs.writeFile(path.join(outside, 'secret.txt'), 'top secret');
  await fs.symlink(path.join(outside, 'secret.txt'), path.join(allowedRoot, 'escape.txt'));
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('resolveLocalImagePath', () => {
  const origRoot = process.env.GHOST_MCP_IMAGE_ROOT;

  beforeEach(() => {
    process.env.GHOST_MCP_IMAGE_ROOT = allowedRoot;
  });

  afterEach(() => {
    if (origRoot === undefined) delete process.env.GHOST_MCP_IMAGE_ROOT;
    else process.env.GHOST_MCP_IMAGE_ROOT = origRoot;
  });

  it('accepts a file inside the configured root', async () => {
    const resolved = await resolveLocalImagePath(path.join(allowedRoot, 'ok.png'));
    // Returns the realpath, which on macOS canonicalizes /var -> /private/var.
    const canonical = await fs.realpath(path.join(allowedRoot, 'ok.png'));
    expect(resolved).toBe(canonical);
  });

  it('rejects when GHOST_MCP_IMAGE_ROOT is unset (local-path mode disabled by default)', async () => {
    delete process.env.GHOST_MCP_IMAGE_ROOT;
    await expect(resolveLocalImagePath('/anywhere.png')).rejects.toThrow(
      /GHOST_MCP_IMAGE_ROOT is not set/
    );
  });

  it('rejects a path outside the configured root', async () => {
    await expect(resolveLocalImagePath(path.join(outside, 'secret.txt'))).rejects.toThrow(
      /outside the allowed root/
    );
  });

  it('rejects a relative traversal attempt', async () => {
    await expect(resolveLocalImagePath(`${allowedRoot}/../outside/secret.txt`)).rejects.toThrow(
      /outside the allowed root/
    );
  });

  it('rejects a symlink that escapes the allowed root', async () => {
    await expect(resolveLocalImagePath(path.join(allowedRoot, 'escape.txt'))).rejects.toThrow(
      /symlink escapes/
    );
  });

  it('rejects a non-existent file', async () => {
    await expect(resolveLocalImagePath(path.join(allowedRoot, 'nope.png'))).rejects.toThrow(
      /does not exist/
    );
  });
});

describe('decodeBase64ToTempFile', () => {
  it('decodes a plain base64 string to a temp file', async () => {
    const payload = Buffer.from('hello png');
    const out = await decodeBase64ToTempFile(payload.toString('base64'), 'image/png');
    try {
      expect(path.extname(out)).toBe('.png');
      const written = await fs.readFile(out);
      expect(written.equals(payload)).toBe(true);
    } finally {
      await fs.unlink(out).catch(() => {});
    }
  });

  it('accepts a full data: URI and ignores the prefix', async () => {
    const payload = Buffer.from('svg-bytes');
    const dataUri = `data:image/svg+xml;base64,${payload.toString('base64')}`;
    const out = await decodeBase64ToTempFile(dataUri, 'image/svg+xml');
    try {
      expect(path.extname(out)).toBe('.svg');
      const written = await fs.readFile(out);
      expect(written.equals(payload)).toBe(true);
    } finally {
      await fs.unlink(out).catch(() => {});
    }
  });

  it('rejects a payload larger than the 5MB cap', async () => {
    const big = Buffer.alloc(MAX_BASE64_BYTES + 1, 0x41);
    await expect(decodeBase64ToTempFile(big.toString('base64'), 'image/png')).rejects.toThrow(
      /exceeds the 5MB/
    );
  });

  it('rejects an unsupported mimeType', async () => {
    const payload = Buffer.from('x');
    await expect(
      decodeBase64ToTempFile(payload.toString('base64'), 'application/zip')
    ).rejects.toThrow(/Unsupported mimeType/);
  });

  it('rejects invalid base64 input', async () => {
    await expect(decodeBase64ToTempFile('not base64 at all!!!', 'image/png')).rejects.toThrow(
      /Invalid base64/
    );
  });

  it('maps image/jpeg to .jpg extension', async () => {
    const payload = Buffer.from([0xff, 0xd8, 0xff]);
    const out = await decodeBase64ToTempFile(payload.toString('base64'), 'image/jpeg');
    try {
      expect(path.extname(out)).toBe('.jpg');
    } finally {
      await fs.unlink(out).catch(() => {});
    }
  });
});
