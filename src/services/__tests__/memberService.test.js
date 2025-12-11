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
  });
});
