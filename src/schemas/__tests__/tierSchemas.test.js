import { describe, it, expect } from 'vitest';
import {
  createTierSchema,
  updateTierSchema,
  tierQuerySchema,
  tierIdSchema,
  tierSlugSchema,
  tierOutputSchema,
  tierBenefitSchema,
  monthlyPriceSchema,
  yearlyPriceSchema,
  benefitOutputSchema,
  monthlyPriceOutputSchema,
  yearlyPriceOutputSchema,
} from '../tierSchemas.js';

describe('Tier Schemas', () => {
  describe('tierBenefitSchema', () => {
    it('should accept valid benefit', () => {
      const benefit = {
        name: 'Access to premium content',
      };

      expect(() => tierBenefitSchema.parse(benefit)).not.toThrow();
    });

    it('should reject empty benefit name', () => {
      const benefit = {
        name: '',
      };

      expect(() => tierBenefitSchema.parse(benefit)).toThrow();
    });

    it('should reject too long benefit name', () => {
      const benefit = {
        name: 'A'.repeat(192),
      };

      expect(() => tierBenefitSchema.parse(benefit)).toThrow();
    });
  });

  describe('monthlyPriceSchema', () => {
    it('should accept valid monthly price', () => {
      const price = {
        amount: 999,
        currency: 'USD',
      };

      expect(() => monthlyPriceSchema.parse(price)).not.toThrow();
    });

    it('should reject negative amount', () => {
      const price = {
        amount: -100,
        currency: 'USD',
      };

      expect(() => monthlyPriceSchema.parse(price)).toThrow();
    });

    it('should reject invalid currency code length', () => {
      const price = {
        amount: 999,
        currency: 'US',
      };

      expect(() => monthlyPriceSchema.parse(price)).toThrow();
    });

    it('should reject lowercase currency code', () => {
      const price = {
        amount: 999,
        currency: 'usd',
      };

      expect(() => monthlyPriceSchema.parse(price)).toThrow();
    });
  });

  describe('yearlyPriceSchema', () => {
    it('should accept valid yearly price', () => {
      const price = {
        amount: 9999,
        currency: 'EUR',
      };

      expect(() => yearlyPriceSchema.parse(price)).not.toThrow();
    });

    it('should reject negative amount', () => {
      const price = {
        amount: -1000,
        currency: 'EUR',
      };

      expect(() => yearlyPriceSchema.parse(price)).toThrow();
    });

    it('should reject invalid currency format', () => {
      const price = {
        amount: 9999,
        currency: 'EURO',
      };

      expect(() => yearlyPriceSchema.parse(price)).toThrow();
    });
  });

  describe('createTierSchema', () => {
    it('should accept valid tier creation data', () => {
      const validTier = {
        name: 'Premium Membership',
        description: 'Access to all premium content',
        monthly_price: 999,
        yearly_price: 9999,
        currency: 'USD',
      };

      expect(() => createTierSchema.parse(validTier)).not.toThrow();
    });

    it('should accept minimal tier creation data (name only)', () => {
      const minimalTier = {
        name: 'Basic Tier',
      };

      const result = createTierSchema.parse(minimalTier);
      expect(result.name).toBe('Basic Tier');
      expect(result.active).toBe(true); // default
      expect(result.type).toBe('paid'); // default
      expect(result.visibility).toBe('public'); // default
      expect(result.trial_days).toBe(0); // default
    });

    it('should accept tier with all fields', () => {
      const fullTier = {
        name: 'VIP Membership',
        description: 'Exclusive VIP access',
        slug: 'vip-membership',
        active: true,
        type: 'paid',
        welcome_page_url: 'https://example.com/welcome',
        visibility: 'public',
        trial_days: 7,
        currency: 'USD',
        monthly_price: 1999,
        yearly_price: 19999,
        benefits: ['Premium content', 'Early access', 'Exclusive newsletter'],
      };

      expect(() => createTierSchema.parse(fullTier)).not.toThrow();
    });

    it('should accept free tier', () => {
      const freeTier = {
        name: 'Free Membership',
        type: 'free',
        benefits: ['Basic access', 'Monthly newsletter'],
      };

      expect(() => createTierSchema.parse(freeTier)).not.toThrow();
    });

    it('should reject tier without name', () => {
      const invalidTier = {
        description: 'Missing name',
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with empty name', () => {
      const invalidTier = {
        name: '',
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with too long name', () => {
      const invalidTier = {
        name: 'A'.repeat(192),
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with too long description', () => {
      const invalidTier = {
        name: 'Tier',
        description: 'A'.repeat(2001),
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with invalid slug', () => {
      const invalidTier = {
        name: 'Tier',
        slug: 'Invalid_Slug',
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with invalid type', () => {
      const invalidTier = {
        name: 'Tier',
        type: 'premium',
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with invalid welcome_page_url', () => {
      const invalidTier = {
        name: 'Tier',
        welcome_page_url: 'not-a-url',
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with invalid visibility', () => {
      const invalidTier = {
        name: 'Tier',
        visibility: 'private',
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with negative trial_days', () => {
      const invalidTier = {
        name: 'Tier',
        trial_days: -1,
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with invalid currency', () => {
      const invalidTier = {
        name: 'Tier',
        currency: 'usd',
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with negative monthly_price', () => {
      const invalidTier = {
        name: 'Tier',
        monthly_price: -100,
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier with negative yearly_price', () => {
      const invalidTier = {
        name: 'Tier',
        yearly_price: -1000,
      };

      expect(() => createTierSchema.parse(invalidTier)).toThrow();
    });
  });

  describe('updateTierSchema', () => {
    it('should accept partial tier updates', () => {
      const update = {
        description: 'Updated description',
      };

      expect(() => updateTierSchema.parse(update)).not.toThrow();
    });

    it('should accept empty update object', () => {
      expect(() => updateTierSchema.parse({})).not.toThrow();
    });

    it('should accept full tier update', () => {
      const update = {
        name: 'Updated Tier',
        description: 'Updated description',
        monthly_price: 1499,
        active: false,
      };

      expect(() => updateTierSchema.parse(update)).not.toThrow();
    });
  });

  describe('tierQuerySchema', () => {
    it('should accept valid query parameters', () => {
      const query = {
        limit: 20,
        page: 2,
        filter: 'type:paid+active:true',
      };

      expect(() => tierQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with include parameter', () => {
      const query = {
        include: 'benefits,monthly_price',
      };

      expect(() => tierQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with order parameter', () => {
      const query = {
        order: 'monthly_price ASC',
      };

      expect(() => tierQuerySchema.parse(query)).not.toThrow();
    });

    it('should reject query with invalid filter characters', () => {
      const query = {
        filter: 'type;DROP TABLE',
      };

      expect(() => tierQuerySchema.parse(query)).toThrow();
    });

    it('should accept empty query object', () => {
      const result = tierQuerySchema.parse({});
      expect(result).toBeDefined();
    });
  });

  describe('tierIdSchema', () => {
    it('should accept valid Ghost ID', () => {
      const validId = {
        id: '507f1f77bcf86cd799439011',
      };

      expect(() => tierIdSchema.parse(validId)).not.toThrow();
    });

    it('should reject invalid Ghost ID', () => {
      const invalidId = {
        id: 'invalid-id',
      };

      expect(() => tierIdSchema.parse(invalidId)).toThrow();
    });
  });

  describe('tierSlugSchema', () => {
    it('should accept valid slug', () => {
      const validSlug = {
        slug: 'premium-tier',
      };

      expect(() => tierSlugSchema.parse(validSlug)).not.toThrow();
    });

    it('should reject invalid slug', () => {
      const invalidSlug = {
        slug: 'Premium_Tier',
      };

      expect(() => tierSlugSchema.parse(invalidSlug)).toThrow();
    });
  });

  describe('benefitOutputSchema', () => {
    it('should accept valid benefit output from Ghost API', () => {
      const apiBenefit = {
        id: '507f1f77bcf86cd799439011',
        name: 'Premium content access',
        slug: 'premium-content-access',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => benefitOutputSchema.parse(apiBenefit)).not.toThrow();
    });

    it('should reject benefit output without required fields', () => {
      const invalidBenefit = {
        name: 'Premium content',
        slug: 'premium-content',
      };

      expect(() => benefitOutputSchema.parse(invalidBenefit)).toThrow();
    });
  });

  describe('monthlyPriceOutputSchema', () => {
    it('should accept valid monthly price output from Ghost API', () => {
      const apiPrice = {
        id: 'price_123',
        tier_id: '507f1f77bcf86cd799439011',
        nickname: 'Monthly Premium',
        amount: 999,
        interval: 'month',
        type: 'recurring',
        currency: 'USD',
        active: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => monthlyPriceOutputSchema.parse(apiPrice)).not.toThrow();
    });

    it('should reject price with wrong interval', () => {
      const invalidPrice = {
        id: 'price_123',
        tier_id: '507f1f77bcf86cd799439011',
        nickname: 'Monthly Premium',
        amount: 999,
        interval: 'year',
        type: 'recurring',
        currency: 'USD',
        active: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => monthlyPriceOutputSchema.parse(invalidPrice)).toThrow();
    });
  });

  describe('yearlyPriceOutputSchema', () => {
    it('should accept valid yearly price output from Ghost API', () => {
      const apiPrice = {
        id: 'price_456',
        tier_id: '507f1f77bcf86cd799439011',
        nickname: 'Yearly Premium',
        amount: 9999,
        interval: 'year',
        type: 'recurring',
        currency: 'EUR',
        active: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => yearlyPriceOutputSchema.parse(apiPrice)).not.toThrow();
    });

    it('should reject price with wrong interval', () => {
      const invalidPrice = {
        id: 'price_456',
        tier_id: '507f1f77bcf86cd799439011',
        nickname: 'Yearly Premium',
        amount: 9999,
        interval: 'month',
        type: 'recurring',
        currency: 'EUR',
        active: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => yearlyPriceOutputSchema.parse(invalidPrice)).toThrow();
    });
  });

  describe('tierOutputSchema', () => {
    it('should accept valid tier output from Ghost API', () => {
      const apiTier = {
        id: '507f1f77bcf86cd799439011',
        name: 'Premium Membership',
        slug: 'premium-membership',
        description: 'Access to premium content',
        active: true,
        type: 'paid',
        welcome_page_url: 'https://example.com/welcome',
        visibility: 'public',
        trial_days: 7,
        currency: 'USD',
        monthly_price: 999,
        yearly_price: 9999,
        monthly_price_id: 'price_123',
        yearly_price_id: 'price_456',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        benefits: [
          {
            id: '507f1f77bcf86cd799439012',
            name: 'Premium content',
            slug: 'premium-content',
            created_at: '2024-01-15T10:30:00.000Z',
            updated_at: '2024-01-15T10:30:00.000Z',
          },
        ],
        monthly_price_object: {
          id: 'price_123',
          tier_id: '507f1f77bcf86cd799439011',
          nickname: 'Monthly Premium',
          amount: 999,
          interval: 'month',
          type: 'recurring',
          currency: 'USD',
          active: true,
          created_at: '2024-01-15T10:30:00.000Z',
          updated_at: '2024-01-15T10:30:00.000Z',
        },
        yearly_price_object: {
          id: 'price_456',
          tier_id: '507f1f77bcf86cd799439011',
          nickname: 'Yearly Premium',
          amount: 9999,
          interval: 'year',
          type: 'recurring',
          currency: 'USD',
          active: true,
          created_at: '2024-01-15T10:30:00.000Z',
          updated_at: '2024-01-15T10:30:00.000Z',
        },
      };

      expect(() => tierOutputSchema.parse(apiTier)).not.toThrow();
    });

    it('should accept tier with null optional fields', () => {
      const apiTier = {
        id: '507f1f77bcf86cd799439011',
        name: 'Free Tier',
        slug: 'free-tier',
        description: null,
        active: true,
        type: 'free',
        welcome_page_url: null,
        visibility: 'public',
        trial_days: 0,
        currency: null,
        monthly_price: null,
        yearly_price: null,
        monthly_price_id: null,
        yearly_price_id: null,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => tierOutputSchema.parse(apiTier)).not.toThrow();
    });

    it('should reject tier output without required fields', () => {
      const invalidTier = {
        name: 'Premium',
        slug: 'premium',
      };

      expect(() => tierOutputSchema.parse(invalidTier)).toThrow();
    });

    it('should reject tier output with invalid type', () => {
      const invalidTier = {
        id: '507f1f77bcf86cd799439011',
        name: 'Premium',
        slug: 'premium',
        active: true,
        type: 'premium',
        visibility: 'public',
        trial_days: 0,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => tierOutputSchema.parse(invalidTier)).toThrow();
    });
  });
});
