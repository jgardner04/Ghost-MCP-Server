import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock ghostServiceImproved functions
vi.mock('../ghostServiceImproved.js', () => ({
  getTiers: vi.fn(),
  getTier: vi.fn(),
  createTier: vi.fn(),
  updateTier: vi.fn(),
  deleteTier: vi.fn(),
}));

// Import after mocks are set up
import { createTierService } from '../tierService.js';
import { createTier } from '../ghostServiceImproved.js';

describe('tierService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTierService - validation', () => {
    it('should accept valid input and create a tier', async () => {
      const validInput = {
        name: 'Premium Membership',
        description: 'Access to premium content',
        monthly_price: 999, // $9.99 in cents
        yearly_price: 9999, // $99.99 in cents
        currency: 'USD',
      };
      const expectedTier = { id: '1', ...validInput };
      createTier.mockResolvedValue(expectedTier);

      const result = await createTierService(validInput);

      expect(result).toEqual(expectedTier);
      expect(createTier).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Premium Membership',
          description: 'Access to premium content',
          monthly_price: 999,
          yearly_price: 9999,
          currency: 'USD',
        })
      );
    });

    it('should reject input with missing name', async () => {
      const invalidInput = {
        monthly_price: 999,
      };

      await expect(createTierService(invalidInput)).rejects.toThrow(
        'Invalid tier input: "name" is required'
      );
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should accept minimal tier with just name', async () => {
      const validInput = {
        name: 'Free Tier',
      };
      const expectedTier = { id: '1', name: 'Free Tier', type: 'free' };
      createTier.mockResolvedValue(expectedTier);

      const result = await createTierService(validInput);

      expect(result).toEqual(expectedTier);
      expect(createTier).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Free Tier',
        })
      );
    });

    it('should validate monthly_price is a number', async () => {
      const invalidInput = {
        name: 'Test Tier',
        monthly_price: 'invalid',
      };

      await expect(createTierService(invalidInput)).rejects.toThrow('Invalid tier input:');
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should validate yearly_price is a number', async () => {
      const invalidInput = {
        name: 'Test Tier',
        yearly_price: 'invalid',
      };

      await expect(createTierService(invalidInput)).rejects.toThrow('Invalid tier input:');
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should validate prices are non-negative', async () => {
      const invalidInput = {
        name: 'Test Tier',
        monthly_price: -100,
      };

      await expect(createTierService(invalidInput)).rejects.toThrow('Invalid tier input:');
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should validate currency is a string', async () => {
      const invalidInput = {
        name: 'Test Tier',
        currency: 123,
      };

      await expect(createTierService(invalidInput)).rejects.toThrow('Invalid tier input:');
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should validate benefits is an array', async () => {
      const invalidInput = {
        name: 'Test Tier',
        benefits: 'not an array',
      };

      await expect(createTierService(invalidInput)).rejects.toThrow('Invalid tier input:');
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should validate benefits array contains only strings', async () => {
      const invalidInput = {
        name: 'Test Tier',
        benefits: ['valid', 123, 'also valid'],
      };

      await expect(createTierService(invalidInput)).rejects.toThrow('Invalid tier input:');
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should validate welcome_page_url is a valid URL', async () => {
      const invalidInput = {
        name: 'Test Tier',
        welcome_page_url: 'not-a-valid-url',
      };

      await expect(createTierService(invalidInput)).rejects.toThrow('Invalid tier input:');
      expect(createTier).not.toHaveBeenCalled();
    });

    it('should accept valid welcome_page_url', async () => {
      const validInput = {
        name: 'Test Tier',
        welcome_page_url: 'https://example.com/welcome',
      };
      createTier.mockResolvedValue({ id: '1', ...validInput });

      await createTierService(validInput);

      expect(createTier).toHaveBeenCalledWith(
        expect.objectContaining({
          welcome_page_url: 'https://example.com/welcome',
        })
      );
    });

    it('should accept tier with benefits array', async () => {
      const validInput = {
        name: 'Premium Tier',
        benefits: ['Access to all posts', 'Ad-free experience', 'Exclusive newsletter'],
      };
      createTier.mockResolvedValue({ id: '1', ...validInput });

      await createTierService(validInput);

      expect(createTier).toHaveBeenCalledWith(
        expect.objectContaining({
          benefits: ['Access to all posts', 'Ad-free experience', 'Exclusive newsletter'],
        })
      );
    });

    it('should create complete tier with all optional fields', async () => {
      const validInput = {
        name: 'Ultimate Tier',
        description: 'Our best offering',
        monthly_price: 1999,
        yearly_price: 19999,
        currency: 'USD',
        benefits: ['Benefit 1', 'Benefit 2'],
        welcome_page_url: 'https://example.com/welcome',
      };
      createTier.mockResolvedValue({ id: '1', ...validInput });

      await createTierService(validInput);

      expect(createTier).toHaveBeenCalledWith({
        name: 'Ultimate Tier',
        description: 'Our best offering',
        monthly_price: 1999,
        yearly_price: 19999,
        currency: 'USD',
        benefits: ['Benefit 1', 'Benefit 2'],
        welcome_page_url: 'https://example.com/welcome',
      });
    });
  });

  describe('createTierService - error handling', () => {
    it('should propagate errors from createTier', async () => {
      const validInput = {
        name: 'Test Tier',
      };
      const error = new Error('Ghost API error');
      createTier.mockRejectedValue(error);

      await expect(createTierService(validInput)).rejects.toThrow('Ghost API error');
    });
  });
});
