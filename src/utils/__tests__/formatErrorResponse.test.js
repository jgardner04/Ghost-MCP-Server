import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatErrorResponse } from '../formatErrorResponse.js';
import { GhostAPIError, ValidationError, NotFoundError } from '../../errors/index.js';

function parseJsonBlock(text) {
  const match = text.match(/```json\n([\s\S]+?)\n```/);
  expect(match, `no JSON block in: ${text}`).toBeTruthy();
  return JSON.parse(match[1]);
}

describe('formatErrorResponse', () => {
  const originalEnv = process.env.GHOST_ADMIN_API_KEY;

  beforeEach(() => {
    process.env.GHOST_ADMIN_API_KEY = '';
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.GHOST_ADMIN_API_KEY;
    else process.env.GHOST_ADMIN_API_KEY = originalEnv;
  });

  it('returns consistent envelope with error key for generic Error (no ghost key)', () => {
    const response = formatErrorResponse(new Error('boom'), 'ghost_get_posts');
    expect(response.isError).toBe(true);
    expect(response.content[0].type).toBe('text');
    const envelope = parseJsonBlock(response.content[0].text);
    expect(envelope.error).toBeDefined();
    expect(envelope.error.message).toBe('boom');
    expect(envelope).not.toHaveProperty('ghost');
    expect(response.content[0].text).toContain('Error in ghost_get_posts: boom');
  });

  it('includes gated ghost sub-object for GhostAPIError', () => {
    const err = new GhostAPIError('posts.edit', 'Title is required', 422);
    const response = formatErrorResponse(err, 'ghost_update_post');
    const envelope = parseJsonBlock(response.content[0].text);
    expect(envelope.error.name).toBe('GhostAPIError');
    expect(envelope.error.code).toBe('GHOST_VALIDATION_ERROR');
    expect(envelope.ghost).toBeDefined();
    expect(envelope.ghost.operation).toBe('posts.edit');
    expect(envelope.ghost.statusCode).toBe(422);
    expect(envelope.ghost.originalMessage).toBe('Title is required');
    expect(response.content[0].text).toContain('422');
    expect(response.content[0].text).toContain('posts.edit');
    expect(response.content[0].text).toContain('Title is required');
  });

  it('uses raw ghostStatusCode (not remapped statusCode) in ghost envelope', () => {
    const err = new GhostAPIError('posts.edit', 'bad', 422);
    // GhostAPIError remaps 422 -> 400 for .statusCode; ghost.statusCode must be 422
    expect(err.statusCode).toBe(400);
    expect(err.ghostStatusCode).toBe(422);
    const envelope = parseJsonBlock(formatErrorResponse(err, 'ghost_update_post').content[0].text);
    expect(envelope.ghost.statusCode).toBe(422);
    expect(envelope.error.statusCode).toBe(400);
  });

  it('does not leak GHOST_ADMIN_API_KEY in surfaced response', () => {
    process.env.GHOST_ADMIN_API_KEY = 'plaintext-admin-key-xyz';
    const err = new GhostAPIError(
      'posts.edit',
      'Ghost complained: token plaintext-admin-key-xyz invalid',
      401
    );
    const response = formatErrorResponse(err, 'ghost_update_post');
    expect(response.content[0].text).not.toContain('plaintext-admin-key-xyz');
    expect(response.content[0].text).toContain('[REDACTED]');
  });

  it('does not leak Ghost-shaped admin key pattern in originalMessage', () => {
    const fakeKey = `${'1'.repeat(24)}:${'2'.repeat(64)}`;
    const err = new GhostAPIError('posts.edit', `failed with ${fakeKey}`, 401);
    const response = formatErrorResponse(err, 'ghost_update_post');
    expect(response.content[0].text).not.toContain(fakeKey);
  });

  it('produces envelope for ValidationError (no ghost key)', () => {
    const err = new ValidationError('Validation failed', [
      { field: 'title', message: 'required', type: 'invalid_type' },
    ]);
    const response = formatErrorResponse(err, 'ghost_update_post');
    const envelope = parseJsonBlock(response.content[0].text);
    expect(envelope.error.code).toBe('VALIDATION_ERROR');
    expect(envelope).not.toHaveProperty('ghost');
  });

  it('produces envelope for NotFoundError (no ghost key)', () => {
    const err = new NotFoundError('Post', 'abc');
    const response = formatErrorResponse(err, 'ghost_get_post');
    const envelope = parseJsonBlock(response.content[0].text);
    expect(envelope.error.code).toBe('NOT_FOUND');
    expect(envelope).not.toHaveProperty('ghost');
  });

  describe('extra context', () => {
    it('includes and sanitizes extra context when provided', () => {
      const extra = {
        orphanedImage: { url: 'https://cdn.example/img.jpg?key=LEAK_ME_XYZ', ref: 'r1' },
      };
      const response = formatErrorResponse(new Error('boom'), 'ghost_set_feature_image', extra);
      const envelope = parseJsonBlock(response.content[0].text);
      expect(envelope.extra).toBeDefined();
      expect(envelope.extra.orphanedImage.url).toContain('key=[REDACTED]');
      expect(response.content[0].text).not.toContain('LEAK_ME_XYZ');
    });

    it('omits extra key entirely when arg is not provided', () => {
      const envelope = parseJsonBlock(
        formatErrorResponse(new Error('boom'), 'ghost_update_post').content[0].text
      );
      expect(envelope).not.toHaveProperty('extra');
    });

    it('omits extra key when arg is empty object (no empty-object leak)', () => {
      const envelope = parseJsonBlock(
        formatErrorResponse(new Error('boom'), 'ghost_update_post', {}).content[0].text
      );
      expect(envelope).not.toHaveProperty('extra');
    });

    it('combines error, ghost, and extra when all apply', () => {
      const err = new GhostAPIError('posts.edit', 'bad', 422);
      const envelope = parseJsonBlock(
        formatErrorResponse(err, 'ghost_set_feature_image', { orphanedImage: { url: 'x' } })
          .content[0].text
      );
      expect(envelope.error).toBeDefined();
      expect(envelope.ghost).toBeDefined();
      expect(envelope.extra).toBeDefined();
    });
  });

  describe('ZodError coercion', () => {
    it('coerces ZodError-shaped input to VALIDATION_ERROR / 400 envelope', () => {
      const zodLike = Object.assign(new Error('zod'), {
        name: 'ZodError',
        issues: [{ path: ['purpose'], message: 'Invalid enum value', code: 'invalid_enum_value' }],
      });
      const envelope = parseJsonBlock(
        formatErrorResponse(zodLike, 'ghost_upload_image').content[0].text
      );
      expect(envelope.error.code).toBe('VALIDATION_ERROR');
      expect(envelope.error.statusCode).toBe(400);
      expect(envelope.error.errors).toEqual([
        { field: 'purpose', message: 'Invalid enum value', type: 'invalid_enum_value' },
      ]);
    });

    it('does not coerce a non-ZodError error that happens to have an issues field', () => {
      const notZod = Object.assign(new Error('unrelated'), { issues: [] });
      const envelope = parseJsonBlock(
        formatErrorResponse(notZod, 'ghost_update_post').content[0].text
      );
      expect(envelope.error.code).toBe('UNKNOWN');
    });
  });
});
