import { describe, it, expect } from 'vitest';
import { sanitizeNqlValue } from '../nqlSanitizer.js';

describe('sanitizeNqlValue', () => {
  it('should escape backslashes', () => {
    expect(sanitizeNqlValue('hello\\world')).toBe('hello\\\\world');
  });

  it('should escape single quotes', () => {
    expect(sanitizeNqlValue("it's")).toBe("it\\'s");
  });

  it('should escape double quotes', () => {
    expect(sanitizeNqlValue('say "hello"')).toBe('say \\"hello\\"');
  });

  it('should escape all three special characters combined', () => {
    expect(sanitizeNqlValue('a\\b\'c"d')).toBe('a\\\\b\\\'c\\"d');
  });

  it('should return null as-is', () => {
    expect(sanitizeNqlValue(null)).toBe(null);
  });

  it('should return undefined as-is', () => {
    expect(sanitizeNqlValue(undefined)).toBe(undefined);
  });

  it('should return empty string as-is', () => {
    expect(sanitizeNqlValue('')).toBe('');
  });

  it('should pass through normal strings without special characters', () => {
    expect(sanitizeNqlValue('simple-value')).toBe('simple-value');
    expect(sanitizeNqlValue('test@example.com')).toBe('test@example.com');
    expect(sanitizeNqlValue('hello world 123')).toBe('hello world 123');
  });
});
