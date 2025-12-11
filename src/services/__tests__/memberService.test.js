import { describe, it, expect } from 'vitest';
import { validateMemberData, validateMemberUpdateData } from '../memberService.js';

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
});
