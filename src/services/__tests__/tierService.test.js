import { describe, it, expect } from 'vitest';
import {
  validateTierData,
  validateTierUpdateData,
  validateTierQueryOptions,
  sanitizeNqlValue,
} from '../tierService.js';
import { ValidationError } from '../../errors/index.js';

describe('tierService - Validation', () => {
  describe('validateTierData', () => {
    it('should validate required name field', () => {
      expect(() => validateTierData({})).toThrow(ValidationError);
      expect(() => validateTierData({})).toThrow('Tier validation failed');
    });

    it('should validate required currency field', () => {
      expect(() => validateTierData({ name: 'Premium' })).toThrow(ValidationError);
      expect(() => validateTierData({ name: 'Premium' })).toThrow('Tier validation failed');
    });

    it('should accept valid tier data with name and currency', () => {
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
        })
      ).not.toThrow();
    });

    it('should validate name is a non-empty string', () => {
      expect(() =>
        validateTierData({
          name: '',
          currency: 'USD',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate name does not exceed max length', () => {
      const longName = 'a'.repeat(192);
      expect(() =>
        validateTierData({
          name: longName,
          currency: 'USD',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate currency is a 3-letter uppercase code', () => {
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'us',
        })
      ).toThrow('Tier validation failed');

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USDD',
        })
      ).toThrow('Tier validation failed');

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: '123',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate description does not exceed max length', () => {
      const longDescription = 'a'.repeat(2001);
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          description: longDescription,
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate monthly_price is a non-negative number', () => {
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          monthly_price: -100,
        })
      ).toThrow('Tier validation failed');

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          monthly_price: 'invalid',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate yearly_price is a non-negative number', () => {
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          yearly_price: -1000,
        })
      ).toThrow('Tier validation failed');

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          yearly_price: 'invalid',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate benefits is an array of strings', () => {
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          benefits: 'not an array',
        })
      ).toThrow('Tier validation failed');

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          benefits: [123, 456],
        })
      ).toThrow('Tier validation failed');

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          benefits: ['Benefit 1', ''],
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate welcome_page_url is a valid URL', () => {
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          welcome_page_url: 'not-a-url',
        })
      ).toThrow('Tier validation failed');

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          welcome_page_url: 'ftp://example.com',
        })
      ).toThrow('Tier validation failed');
    });

    it('should accept valid welcome_page_url', () => {
      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          welcome_page_url: 'https://example.com/welcome',
        })
      ).not.toThrow();

      expect(() =>
        validateTierData({
          name: 'Premium',
          currency: 'USD',
          welcome_page_url: 'http://example.com/welcome',
        })
      ).not.toThrow();
    });

    it('should accept complete valid tier data', () => {
      expect(() =>
        validateTierData({
          name: 'Premium Membership',
          description: 'Access to premium content',
          currency: 'USD',
          monthly_price: 999,
          yearly_price: 9999,
          benefits: ['Ad-free experience', 'Exclusive content', 'Priority support'],
          welcome_page_url: 'https://example.com/welcome',
        })
      ).not.toThrow();
    });
  });

  describe('validateTierUpdateData', () => {
    it('should accept empty update data', () => {
      expect(() => validateTierUpdateData({})).not.toThrow();
    });

    it('should validate name if provided', () => {
      expect(() =>
        validateTierUpdateData({
          name: '',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate currency if provided', () => {
      expect(() =>
        validateTierUpdateData({
          currency: 'us',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate description length if provided', () => {
      const longDescription = 'a'.repeat(2001);
      expect(() =>
        validateTierUpdateData({
          description: longDescription,
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate monthly_price if provided', () => {
      expect(() =>
        validateTierUpdateData({
          monthly_price: -100,
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate yearly_price if provided', () => {
      expect(() =>
        validateTierUpdateData({
          yearly_price: -1000,
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate benefits if provided', () => {
      expect(() =>
        validateTierUpdateData({
          benefits: 'not an array',
        })
      ).toThrow('Tier validation failed');
    });

    it('should validate welcome_page_url if provided', () => {
      expect(() =>
        validateTierUpdateData({
          welcome_page_url: 'not-a-url',
        })
      ).toThrow('Tier validation failed');
    });

    it('should accept valid update data', () => {
      expect(() =>
        validateTierUpdateData({
          name: 'Updated Premium',
          monthly_price: 1299,
          benefits: ['New benefit'],
        })
      ).not.toThrow();
    });
  });

  describe('validateTierQueryOptions', () => {
    it('should accept empty options', () => {
      expect(() => validateTierQueryOptions({})).not.toThrow();
    });

    it('should validate limit is within range', () => {
      expect(() => validateTierQueryOptions({ limit: 0 })).toThrow('Tier query validation failed');

      expect(() => validateTierQueryOptions({ limit: 101 })).toThrow(
        'Tier query validation failed'
      );

      expect(() => validateTierQueryOptions({ limit: 50 })).not.toThrow();
    });

    it('should validate limit is a number', () => {
      expect(() => validateTierQueryOptions({ limit: 'invalid' })).toThrow(
        'Tier query validation failed'
      );
    });

    it('should validate page is >= 1', () => {
      expect(() => validateTierQueryOptions({ page: 0 })).toThrow('Tier query validation failed');

      expect(() => validateTierQueryOptions({ page: -1 })).toThrow('Tier query validation failed');

      expect(() => validateTierQueryOptions({ page: 1 })).not.toThrow();
    });

    it('should validate page is a number', () => {
      expect(() => validateTierQueryOptions({ page: 'invalid' })).toThrow(
        'Tier query validation failed'
      );
    });

    it('should validate filter is a non-empty string', () => {
      expect(() => validateTierQueryOptions({ filter: '' })).toThrow(
        'Tier query validation failed'
      );

      expect(() => validateTierQueryOptions({ filter: '   ' })).toThrow(
        'Tier query validation failed'
      );

      expect(() => validateTierQueryOptions({ filter: 'type:paid' })).not.toThrow();
    });

    it('should validate order is a non-empty string', () => {
      expect(() => validateTierQueryOptions({ order: '' })).toThrow('Tier query validation failed');

      expect(() => validateTierQueryOptions({ order: 'created_at desc' })).not.toThrow();
    });

    it('should validate include is a non-empty string', () => {
      expect(() => validateTierQueryOptions({ include: '' })).toThrow(
        'Tier query validation failed'
      );

      expect(() =>
        validateTierQueryOptions({ include: 'monthly_price,yearly_price' })
      ).not.toThrow();
    });

    it('should accept valid query options', () => {
      expect(() =>
        validateTierQueryOptions({
          limit: 50,
          page: 2,
          filter: 'type:paid',
          order: 'created_at desc',
          include: 'monthly_price,yearly_price',
        })
      ).not.toThrow();
    });
  });

  describe('sanitizeNqlValue', () => {
    it('should return value if undefined or null', () => {
      expect(sanitizeNqlValue(null)).toBe(null);
      expect(sanitizeNqlValue(undefined)).toBe(undefined);
    });

    it('should escape backslashes', () => {
      expect(sanitizeNqlValue('test\\value')).toBe('test\\\\value');
    });

    it('should escape single quotes', () => {
      expect(sanitizeNqlValue("test'value")).toBe("test\\'value");
    });

    it('should escape double quotes', () => {
      expect(sanitizeNqlValue('test"value')).toBe('test\\"value');
    });

    it('should escape multiple special characters', () => {
      expect(sanitizeNqlValue('test\\value"with\'quotes')).toBe('test\\\\value\\"with\\\'quotes');
    });

    it('should handle strings without special characters', () => {
      expect(sanitizeNqlValue('simple-value')).toBe('simple-value');
    });
  });
});
