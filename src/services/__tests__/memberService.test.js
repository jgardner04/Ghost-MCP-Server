import { describe, it, expect } from 'vitest';
import {
  validateMemberData,
  validateMemberUpdateData,
  validateMemberQueryOptions,
  validateMemberLookup,
  validateSearchQuery,
  sanitizeNqlValue,
} from '../memberService.js';

describe('memberService - Validation', () => {
  describe('validateMemberData', () => {
    it('should validate required email field', () => {
      expect(() => validateMemberData({})).toThrow('Member validation failed');
      expect(() => validateMemberData({ email: '' })).toThrow('Member validation failed');
      expect(() => validateMemberData({ email: '   ' })).toThrow('Member validation failed');
    });

    it('should validate email format', () => {
      expect(() => validateMemberData({ email: 'invalid-email' })).toThrow(
        'Member validation failed'
      );
      expect(() => validateMemberData({ email: 'test@' })).toThrow('Member validation failed');
      expect(() => validateMemberData({ email: '@test.com' })).toThrow('Member validation failed');
    });

    it('should accept valid email', () => {
      expect(() => validateMemberData({ email: 'test@example.com' })).not.toThrow();
    });

    it('should accept optional name field', () => {
      expect(() =>
        validateMemberData({ email: 'test@example.com', name: 'John Doe' })
      ).not.toThrow();
    });

    it('should accept optional note field', () => {
      expect(() =>
        validateMemberData({ email: 'test@example.com', note: 'Test note' })
      ).not.toThrow();
    });

    it('should accept optional labels array', () => {
      expect(() =>
        validateMemberData({ email: 'test@example.com', labels: ['premium', 'newsletter'] })
      ).not.toThrow();
    });

    it('should validate labels is an array', () => {
      expect(() => validateMemberData({ email: 'test@example.com', labels: 'premium' })).toThrow(
        'Member validation failed'
      );
    });

    it('should accept optional newsletters array', () => {
      expect(() =>
        validateMemberData({
          email: 'test@example.com',
          newsletters: [{ id: 'newsletter-1' }],
        })
      ).not.toThrow();
    });

    it('should validate newsletter objects have id field', () => {
      expect(() =>
        validateMemberData({
          email: 'test@example.com',
          newsletters: [{ name: 'Newsletter' }],
        })
      ).toThrow('Member validation failed');
    });

    it('should accept optional subscribed boolean', () => {
      expect(() =>
        validateMemberData({ email: 'test@example.com', subscribed: true })
      ).not.toThrow();
      expect(() =>
        validateMemberData({ email: 'test@example.com', subscribed: false })
      ).not.toThrow();
    });

    it('should validate subscribed is a boolean', () => {
      expect(() => validateMemberData({ email: 'test@example.com', subscribed: 'yes' })).toThrow(
        'Member validation failed'
      );
    });

    it('should validate name length', () => {
      const longName = 'a'.repeat(192); // Exceeds MAX_NAME_LENGTH (191)
      expect(() => validateMemberData({ email: 'test@example.com', name: longName })).toThrow(
        'Member validation failed'
      );
    });

    it('should accept name at max length', () => {
      const maxName = 'a'.repeat(191); // At MAX_NAME_LENGTH
      expect(() => validateMemberData({ email: 'test@example.com', name: maxName })).not.toThrow();
    });

    it('should validate note length', () => {
      const longNote = 'a'.repeat(2001); // Exceeds MAX_NOTE_LENGTH (2000)
      expect(() => validateMemberData({ email: 'test@example.com', note: longNote })).toThrow(
        'Member validation failed'
      );
    });

    it('should accept note at max length', () => {
      const maxNote = 'a'.repeat(2000); // At MAX_NOTE_LENGTH
      expect(() => validateMemberData({ email: 'test@example.com', note: maxNote })).not.toThrow();
    });

    it('should sanitize HTML in note field', () => {
      const memberData = {
        email: 'test@example.com',
        note: '<script>alert("xss")</script>Test note',
      };
      validateMemberData(memberData);
      expect(memberData.note).toBe('Test note'); // HTML should be stripped
    });

    it('should validate label length', () => {
      const longLabel = 'a'.repeat(192); // Exceeds MAX_LABEL_LENGTH (191)
      expect(() => validateMemberData({ email: 'test@example.com', labels: [longLabel] })).toThrow(
        'Member validation failed'
      );
    });

    it('should reject empty string labels', () => {
      expect(() => validateMemberData({ email: 'test@example.com', labels: [''] })).toThrow(
        'Member validation failed'
      );
      expect(() => validateMemberData({ email: 'test@example.com', labels: ['  '] })).toThrow(
        'Member validation failed'
      );
    });

    it('should reject non-string labels', () => {
      expect(() => validateMemberData({ email: 'test@example.com', labels: [123] })).toThrow(
        'Member validation failed'
      );
    });

    it('should reject empty newsletter IDs', () => {
      expect(() =>
        validateMemberData({ email: 'test@example.com', newsletters: [{ id: '' }] })
      ).toThrow('Member validation failed');
      expect(() =>
        validateMemberData({ email: 'test@example.com', newsletters: [{ id: '  ' }] })
      ).toThrow('Member validation failed');
    });
  });

  describe('validateMemberUpdateData', () => {
    it('should validate email format if provided', () => {
      expect(() => validateMemberUpdateData({ email: 'invalid-email' })).toThrow(
        'Member validation failed'
      );
      expect(() => validateMemberUpdateData({ email: 'test@example.com' })).not.toThrow();
    });

    it('should accept update with only name', () => {
      expect(() => validateMemberUpdateData({ name: 'John Doe' })).not.toThrow();
    });

    it('should accept update with only note', () => {
      expect(() => validateMemberUpdateData({ note: 'Updated note' })).not.toThrow();
    });

    it('should accept update with only labels', () => {
      expect(() => validateMemberUpdateData({ labels: ['premium'] })).not.toThrow();
    });

    it('should validate labels is an array if provided', () => {
      expect(() => validateMemberUpdateData({ labels: 'premium' })).toThrow(
        'Member validation failed'
      );
    });

    it('should accept update with only newsletters', () => {
      expect(() =>
        validateMemberUpdateData({ newsletters: [{ id: 'newsletter-1' }] })
      ).not.toThrow();
    });

    it('should validate newsletter objects have id field if provided', () => {
      expect(() => validateMemberUpdateData({ newsletters: [{ name: 'Newsletter' }] })).toThrow(
        'Member validation failed'
      );
    });

    it('should allow empty update object', () => {
      expect(() => validateMemberUpdateData({})).not.toThrow();
    });

    it('should validate name length in updates', () => {
      const longName = 'a'.repeat(192); // Exceeds MAX_NAME_LENGTH (191)
      expect(() => validateMemberUpdateData({ name: longName })).toThrow(
        'Member validation failed'
      );
    });

    it('should accept name at max length in updates', () => {
      const maxName = 'a'.repeat(191); // At MAX_NAME_LENGTH
      expect(() => validateMemberUpdateData({ name: maxName })).not.toThrow();
    });

    it('should validate note length in updates', () => {
      const longNote = 'a'.repeat(2001); // Exceeds MAX_NOTE_LENGTH (2000)
      expect(() => validateMemberUpdateData({ note: longNote })).toThrow(
        'Member validation failed'
      );
    });

    it('should accept note at max length in updates', () => {
      const maxNote = 'a'.repeat(2000); // At MAX_NOTE_LENGTH
      expect(() => validateMemberUpdateData({ note: maxNote })).not.toThrow();
    });

    it('should sanitize HTML in note field for updates', () => {
      const updateData = { note: '<script>alert("xss")</script>Updated note' };
      validateMemberUpdateData(updateData);
      expect(updateData.note).toBe('Updated note'); // HTML should be stripped
    });

    it('should validate label length in updates', () => {
      const longLabel = 'a'.repeat(192); // Exceeds MAX_LABEL_LENGTH (191)
      expect(() => validateMemberUpdateData({ labels: [longLabel] })).toThrow(
        'Member validation failed'
      );
    });

    it('should reject empty string labels in updates', () => {
      expect(() => validateMemberUpdateData({ labels: [''] })).toThrow('Member validation failed');
      expect(() => validateMemberUpdateData({ labels: ['  '] })).toThrow(
        'Member validation failed'
      );
    });

    it('should reject non-string labels in updates', () => {
      expect(() => validateMemberUpdateData({ labels: [123] })).toThrow('Member validation failed');
    });

    it('should reject empty newsletter IDs in updates', () => {
      expect(() => validateMemberUpdateData({ newsletters: [{ id: '' }] })).toThrow(
        'Member validation failed'
      );
      expect(() => validateMemberUpdateData({ newsletters: [{ id: '  ' }] })).toThrow(
        'Member validation failed'
      );
    });
  });

  describe('validateMemberQueryOptions', () => {
    it('should accept empty options', () => {
      expect(() => validateMemberQueryOptions({})).not.toThrow();
    });

    it('should accept valid limit within bounds', () => {
      expect(() => validateMemberQueryOptions({ limit: 1 })).not.toThrow();
      expect(() => validateMemberQueryOptions({ limit: 50 })).not.toThrow();
      expect(() => validateMemberQueryOptions({ limit: 100 })).not.toThrow();
    });

    it('should reject limit below minimum', () => {
      expect(() => validateMemberQueryOptions({ limit: 0 })).toThrow(
        'Member query validation failed'
      );
      expect(() => validateMemberQueryOptions({ limit: -1 })).toThrow(
        'Member query validation failed'
      );
    });

    it('should reject limit above maximum', () => {
      expect(() => validateMemberQueryOptions({ limit: 101 })).toThrow(
        'Member query validation failed'
      );
    });

    it('should accept valid page number', () => {
      expect(() => validateMemberQueryOptions({ page: 1 })).not.toThrow();
      expect(() => validateMemberQueryOptions({ page: 100 })).not.toThrow();
    });

    it('should reject page below minimum', () => {
      expect(() => validateMemberQueryOptions({ page: 0 })).toThrow(
        'Member query validation failed'
      );
      expect(() => validateMemberQueryOptions({ page: -1 })).toThrow(
        'Member query validation failed'
      );
    });

    it('should accept valid filter strings', () => {
      expect(() => validateMemberQueryOptions({ filter: 'status:free' })).not.toThrow();
      expect(() => validateMemberQueryOptions({ filter: 'status:paid' })).not.toThrow();
      expect(() => validateMemberQueryOptions({ filter: 'subscribed:true' })).not.toThrow();
    });

    it('should reject empty filter string', () => {
      expect(() => validateMemberQueryOptions({ filter: '' })).toThrow(
        'Member query validation failed'
      );
      expect(() => validateMemberQueryOptions({ filter: '   ' })).toThrow(
        'Member query validation failed'
      );
    });

    it('should accept valid order strings', () => {
      expect(() => validateMemberQueryOptions({ order: 'created_at desc' })).not.toThrow();
      expect(() => validateMemberQueryOptions({ order: 'email asc' })).not.toThrow();
    });

    it('should reject empty order string', () => {
      expect(() => validateMemberQueryOptions({ order: '' })).toThrow(
        'Member query validation failed'
      );
    });

    it('should accept valid include strings', () => {
      expect(() => validateMemberQueryOptions({ include: 'labels' })).not.toThrow();
      expect(() => validateMemberQueryOptions({ include: 'newsletters' })).not.toThrow();
      expect(() => validateMemberQueryOptions({ include: 'labels,newsletters' })).not.toThrow();
    });

    it('should reject empty include string', () => {
      expect(() => validateMemberQueryOptions({ include: '' })).toThrow(
        'Member query validation failed'
      );
    });

    it('should validate multiple options together', () => {
      expect(() =>
        validateMemberQueryOptions({
          limit: 50,
          page: 2,
          filter: 'status:paid',
          order: 'created_at desc',
          include: 'labels,newsletters',
        })
      ).not.toThrow();
    });
  });

  describe('validateMemberLookup', () => {
    it('should accept valid id', () => {
      expect(() => validateMemberLookup({ id: '12345' })).not.toThrow();
    });

    it('should accept valid email', () => {
      expect(() => validateMemberLookup({ email: 'test@example.com' })).not.toThrow();
    });

    it('should reject when both id and email are missing', () => {
      expect(() => validateMemberLookup({})).toThrow('Member lookup validation failed');
    });

    it('should reject empty id', () => {
      expect(() => validateMemberLookup({ id: '' })).toThrow('Member lookup validation failed');
      expect(() => validateMemberLookup({ id: '   ' })).toThrow('Member lookup validation failed');
    });

    it('should reject invalid email format', () => {
      expect(() => validateMemberLookup({ email: 'invalid-email' })).toThrow(
        'Member lookup validation failed'
      );
      expect(() => validateMemberLookup({ email: 'test@' })).toThrow(
        'Member lookup validation failed'
      );
    });

    it('should accept when both id and email provided (id takes precedence)', () => {
      expect(() => validateMemberLookup({ id: '12345', email: 'test@example.com' })).not.toThrow();
    });

    it('should return normalized params with lookupType', () => {
      const resultId = validateMemberLookup({ id: '12345' });
      expect(resultId).toEqual({ id: '12345', lookupType: 'id' });

      const resultEmail = validateMemberLookup({ email: 'test@example.com' });
      expect(resultEmail).toEqual({ email: 'test@example.com', lookupType: 'email' });

      // ID takes precedence when both provided
      const resultBoth = validateMemberLookup({ id: '12345', email: 'test@example.com' });
      expect(resultBoth).toEqual({ id: '12345', lookupType: 'id' });
    });
  });

  describe('validateSearchQuery', () => {
    it('should accept valid search query', () => {
      expect(() => validateSearchQuery('john')).not.toThrow();
      expect(() => validateSearchQuery('john@example.com')).not.toThrow();
    });

    it('should reject empty search query', () => {
      expect(() => validateSearchQuery('')).toThrow('Search query validation failed');
      expect(() => validateSearchQuery('   ')).toThrow('Search query validation failed');
    });

    it('should reject non-string search query', () => {
      expect(() => validateSearchQuery(123)).toThrow('Search query validation failed');
      expect(() => validateSearchQuery(null)).toThrow('Search query validation failed');
      expect(() => validateSearchQuery(undefined)).toThrow('Search query validation failed');
    });

    it('should return sanitized query', () => {
      const result = validateSearchQuery('john');
      expect(result).toBe('john');
    });

    it('should trim whitespace from query', () => {
      const result = validateSearchQuery('  john  ');
      expect(result).toBe('john');
    });
  });

  describe('sanitizeNqlValue', () => {
    it('should escape backslashes', () => {
      expect(sanitizeNqlValue('test\\value')).toBe('test\\\\value');
    });

    it('should escape single quotes', () => {
      expect(sanitizeNqlValue("test'value")).toBe("test\\'value");
    });

    it('should escape double quotes', () => {
      expect(sanitizeNqlValue('test"value')).toBe('test\\"value');
    });

    it('should handle multiple special characters', () => {
      expect(sanitizeNqlValue('test\'value"with\\chars')).toBe('test\\\'value\\"with\\\\chars');
    });

    it('should not modify strings without special characters', () => {
      expect(sanitizeNqlValue('normalvalue')).toBe('normalvalue');
      expect(sanitizeNqlValue('test@example.com')).toBe('test@example.com');
    });

    it('should handle empty string', () => {
      expect(sanitizeNqlValue('')).toBe('');
    });
  });
});
