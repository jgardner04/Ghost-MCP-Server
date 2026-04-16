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

  it('redacts every value in a multi-value Cookie header', () => {
    const out = sanitizeErrorPayload({
      error: { message: 'Cookie: a=first; b=SECRET_SESSION; c=third' },
    });
    expect(out.error.message).not.toContain('SECRET_SESSION');
    expect(out.error.message).not.toContain('a=first');
    expect(out.error.message).not.toContain('c=third');
    expect(out.error.message).toContain('Cookie: [REDACTED]');
  });

  it('redacts Set-Cookie value but preserves attributes (HttpOnly, Secure, Path)', () => {
    const out = sanitizeErrorPayload({
      error: { message: 'Set-Cookie: sess=TOKEN_XYZ; HttpOnly; Secure; Path=/' },
    });
    expect(out.error.message).not.toContain('TOKEN_XYZ');
    expect(out.error.message).toContain('Set-Cookie: [REDACTED]');
    expect(out.error.message).toContain('HttpOnly');
    expect(out.error.message).toContain('Secure');
  });

  it('redacts secrets inside string elements of arrays (truncation flag no longer needed)', () => {
    const out = sanitizeErrorPayload({
      ghost: {
        originalMessage: ['https://x/y?key=LEAKED_1', 'https://x/y?token=LEAKED_2'],
      },
    });
    expect(JSON.stringify(out)).not.toContain('LEAKED_1');
    expect(JSON.stringify(out)).not.toContain('LEAKED_2');
    expect(out.ghost.originalMessage[0]).toContain('key=[REDACTED]');
    expect(out.ghost.originalMessage[1]).toContain('token=[REDACTED]');
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

  it('truncates long originalMessage to 2KB cap', () => {
    const longMsg = 'x'.repeat(5000);
    const out = sanitizeErrorPayload({
      ghost: { originalMessage: longMsg },
    });
    // 2048-byte cap + ellipsis suffix: result stays under 2100 characters.
    expect(out.ghost.originalMessage.length).toBeLessThan(2100);
    expect(out.ghost.originalMessage).toContain('[truncated]');
  });

  it('caps generic strings at 4KB even outside ghost.originalMessage', () => {
    const longMsg = 'y'.repeat(10000);
    const out = sanitizeErrorPayload({
      error: { message: longMsg },
    });
    expect(out.error.message.length).toBeLessThan(4200);
    expect(out.error.message).toContain('[truncated]');
  });

  it('redacts before truncation so sliced content cannot leak a secret prefix', () => {
    // Secret placed near the END of a 5000-byte string, AFTER the 4 KB cap.
    // redactString runs first during walk(); truncate runs on the redacted text.
    const secret = `${'a'.repeat(24)}:${'b'.repeat(64)}`;
    const msg = 'x'.repeat(4900) + secret;
    const out = sanitizeErrorPayload({ error: { message: msg } });
    // Secret must be redacted regardless of whether it fell on the truncated side.
    expect(out.error.message).not.toContain(secret);
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
