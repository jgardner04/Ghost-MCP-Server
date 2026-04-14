import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeErrorPayload } from '../sanitizeErrorPayload.js';

describe('sanitizeErrorPayload', () => {
  const originalEnv = process.env.GHOST_ADMIN_API_KEY;

  beforeEach(() => {
    process.env.GHOST_ADMIN_API_KEY = '';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.GHOST_ADMIN_API_KEY;
    } else {
      process.env.GHOST_ADMIN_API_KEY = originalEnv;
    }
  });

  it('redacts GHOST_ADMIN_API_KEY when it appears verbatim in a nested string', () => {
    process.env.GHOST_ADMIN_API_KEY = 'super-secret-env-key-value';
    const input = {
      error: { message: 'Leaked super-secret-env-key-value in text' },
      ghost: { originalMessage: 'also super-secret-env-key-value here' },
    };
    const out = sanitizeErrorPayload(input);
    expect(out.error.message).not.toContain('super-secret-env-key-value');
    expect(out.error.message).toContain('[REDACTED]');
    expect(out.ghost.originalMessage).not.toContain('super-secret-env-key-value');
  });

  it('redacts Ghost-shaped admin key literal embedded in text', () => {
    const key = `${'a'.repeat(24)}:${'b'.repeat(64)}`;
    const out = sanitizeErrorPayload({
      error: { message: `Bad auth with ${key} failed` },
    });
    expect(out.error.message).not.toContain(key);
    expect(out.error.message).toContain('[REDACTED]');
  });

  it('redacts key= token= and access_token= query params on URLs', () => {
    const out = sanitizeErrorPayload({
      error: { message: 'GET https://ghost.example/admin?key=abc123&other=fine' },
      ghost: {
        originalMessage: 'https://x/y?token=xyz and https://x/y?access_token=qqq',
      },
    });
    expect(out.error.message).toContain('key=[REDACTED]');
    expect(out.error.message).toContain('other=fine');
    expect(out.ghost.originalMessage).toContain('token=[REDACTED]');
    expect(out.ghost.originalMessage).toContain('access_token=[REDACTED]');
  });

  it('redacts Authorization / Cookie header-style substrings', () => {
    const out = sanitizeErrorPayload({
      error: { message: 'Authorization: Bearer abc.def.ghi and Cookie: sess=xyz' },
    });
    expect(out.error.message).not.toContain('abc.def.ghi');
    expect(out.error.message).not.toContain('sess=xyz');
    expect(out.error.message).toContain('Authorization');
    expect(out.error.message).toContain('[REDACTED]');
  });

  it('leaves benign content untouched', () => {
    const input = {
      error: { message: 'Title is required', code: 'GHOST_VALIDATION_ERROR', statusCode: 400 },
      ghost: {
        operation: 'posts.edit',
        statusCode: 422,
        originalMessage: 'Post title cannot be blank',
      },
    };
    const out = sanitizeErrorPayload(input);
    expect(out).toEqual(input);
  });

  it('truncates long originalMessage', () => {
    const longMsg = 'x'.repeat(5000);
    const out = sanitizeErrorPayload({
      ghost: { originalMessage: longMsg },
    });
    expect(out.ghost.originalMessage.length).toBeLessThan(longMsg.length);
    expect(out.ghost.originalMessage).toContain('[truncated]');
  });

  it('does not redact env key when env var is empty', () => {
    process.env.GHOST_ADMIN_API_KEY = '';
    const out = sanitizeErrorPayload({ error: { message: 'harmless text' } });
    expect(out.error.message).toBe('harmless text');
  });

  it('does not mutate the input object', () => {
    process.env.GHOST_ADMIN_API_KEY = 'SECRET';
    const input = { error: { message: 'contains SECRET' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    sanitizeErrorPayload(input);
    expect(input).toEqual(snapshot);
  });
});
