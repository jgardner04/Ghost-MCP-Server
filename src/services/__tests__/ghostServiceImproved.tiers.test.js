import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

// Mock the Ghost Admin API with tiers support
vi.mock('@tryghost/admin-api', () => ({
  default: vi.fn(function () {
    return {
      posts: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      pages: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      tags: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      members: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      tiers: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      site: {
        read: vi.fn(),
      },
      images: {
        upload: vi.fn(),
      },
    };
  }),
}));

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock fs for validateImagePath
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
  },
}));

// Import after setting up mocks
import {
  createTier,
  updateTier,
  deleteTier,
  getTiers,
  getTier,
  api,
} from '../ghostServiceImproved.js';

describe('ghostServiceImproved - Tiers', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('createTier', () => {
    it('should create a tier with required fields', async () => {
      const tierData = {
        name: 'Premium',
        currency: 'USD',
      };

      const mockCreatedTier = {
        id: 'tier-1',
        name: 'Premium',
        currency: 'USD',
        type: 'paid',
        active: true,
      };

      api.tiers.add.mockResolvedValue(mockCreatedTier);

      const result = await createTier(tierData);

      expect(api.tiers.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Premium',
          currency: 'USD',
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockCreatedTier);
    });

    it('should create a tier with all optional fields', async () => {
      const tierData = {
        name: 'Premium Membership',
        currency: 'USD',
        description: 'Access to premium content',
        monthly_price: 999,
        yearly_price: 9999,
        benefits: ['Ad-free experience', 'Exclusive content'],
        welcome_page_url: 'https://example.com/welcome',
      };

      const mockCreatedTier = {
        id: 'tier-2',
        ...tierData,
        type: 'paid',
        active: true,
      };

      api.tiers.add.mockResolvedValue(mockCreatedTier);

      const result = await createTier(tierData);

      expect(api.tiers.add).toHaveBeenCalledWith(
        expect.objectContaining(tierData),
        expect.any(Object)
      );
      expect(result).toEqual(mockCreatedTier);
    });

    it('should throw ValidationError when name is missing', async () => {
      await expect(
        createTier({
          currency: 'USD',
        })
      ).rejects.toThrow('Tier validation failed');
    });

    it('should throw ValidationError when currency is missing', async () => {
      await expect(
        createTier({
          name: 'Premium',
        })
      ).rejects.toThrow('Tier validation failed');
    });

    it('should throw ValidationError when currency is invalid', async () => {
      await expect(
        createTier({
          name: 'Premium',
          currency: 'us',
        })
      ).rejects.toThrow('Tier validation failed');
    });
  });

  describe('getTiers', () => {
    it('should get all tiers with default options', async () => {
      const mockTiers = [
        {
          id: 'tier-1',
          name: 'Free',
          type: 'free',
          active: true,
        },
        {
          id: 'tier-2',
          name: 'Premium',
          type: 'paid',
          active: true,
        },
      ];

      api.tiers.browse.mockResolvedValue(mockTiers);

      const result = await getTiers();

      expect(api.tiers.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 15,
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockTiers);
    });

    it('should get tiers with custom limit', async () => {
      const mockTiers = [
        {
          id: 'tier-1',
          name: 'Free',
          type: 'free',
          active: true,
        },
      ];

      api.tiers.browse.mockResolvedValue(mockTiers);

      const result = await getTiers({ limit: 5 });

      expect(api.tiers.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockTiers);
    });

    it('should get tiers with filter', async () => {
      const mockTiers = [
        {
          id: 'tier-2',
          name: 'Premium',
          type: 'paid',
          active: true,
        },
      ];

      api.tiers.browse.mockResolvedValue(mockTiers);

      const result = await getTiers({ filter: 'type:paid' });

      expect(api.tiers.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: 'type:paid',
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockTiers);
    });

    it('should return empty array when no tiers found', async () => {
      api.tiers.browse.mockResolvedValue([]);

      const result = await getTiers();

      expect(result).toEqual([]);
    });

    it('should throw ValidationError for invalid limit', async () => {
      await expect(getTiers({ limit: 0 })).rejects.toThrow('Tier query validation failed');
      await expect(getTiers({ limit: 101 })).rejects.toThrow('Tier query validation failed');
    });
  });

  describe('getTier', () => {
    it('should get a single tier by ID', async () => {
      const mockTier = {
        id: 'tier-1',
        name: 'Premium',
        currency: 'USD',
        type: 'paid',
        active: true,
      };

      api.tiers.read.mockResolvedValue(mockTier);

      const result = await getTier('tier-1');

      expect(api.tiers.read).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tier-1',
        }),
        expect.objectContaining({
          id: 'tier-1',
        })
      );
      expect(result).toEqual(mockTier);
    });

    it('should throw ValidationError when ID is missing', async () => {
      await expect(getTier()).rejects.toThrow('Tier ID is required');
    });

    it('should throw ValidationError when ID is empty string', async () => {
      await expect(getTier('')).rejects.toThrow('Tier ID is required');
    });

    it('should throw NotFoundError when tier does not exist', async () => {
      const mockError = new Error('Tier not found');
      mockError.response = { status: 404 };

      api.tiers.read.mockRejectedValue(mockError);

      await expect(getTier('nonexistent-id')).rejects.toThrow();
    });
  });

  describe('updateTier', () => {
    it('should send only update fields and updated_at, not the full existing tier', async () => {
      const existingTier = {
        id: 'tier-1',
        slug: 'premium',
        name: 'Premium',
        currency: 'USD',
        monthly_price: 999,
        type: 'paid',
        active: true,
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const updateData = {
        name: 'Premium Plus',
        monthly_price: 1299,
      };

      const mockUpdatedTier = {
        ...existingTier,
        ...updateData,
      };

      api.tiers.read.mockResolvedValue(existingTier);
      api.tiers.edit.mockResolvedValue(mockUpdatedTier);

      const result = await updateTier('tier-1', updateData);

      expect(api.tiers.read).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tier-1' }),
        expect.objectContaining({ id: 'tier-1' })
      );
      // Should send ONLY updateData + updated_at, NOT the full existing tier
      expect(api.tiers.edit).toHaveBeenCalledWith(
        { name: 'Premium Plus', monthly_price: 1299, updated_at: '2024-01-01T00:00:00.000Z' },
        expect.objectContaining({ id: 'tier-1' })
      );
      // Verify read-only fields are NOT sent
      const editCallData = api.tiers.edit.mock.calls[0][0];
      expect(editCallData).not.toHaveProperty('slug');
      expect(editCallData).not.toHaveProperty('type');
      expect(editCallData).not.toHaveProperty('active');
      expect(result).toEqual(mockUpdatedTier);
    });

    it('should throw ValidationError when ID is missing', async () => {
      await expect(updateTier('', { name: 'Updated' })).rejects.toThrow(
        'Tier ID is required for update'
      );
    });

    it('should throw ValidationError for invalid update data', async () => {
      await expect(updateTier('tier-1', { monthly_price: -100 })).rejects.toThrow(
        'Tier validation failed'
      );
    });

    it('should throw NotFoundError when tier does not exist', async () => {
      const mockError = new Error('Tier not found');
      mockError.response = { status: 404 };

      api.tiers.read.mockRejectedValue(mockError);

      await expect(updateTier('nonexistent-id', { name: 'Updated' })).rejects.toThrow();
    });
  });

  describe('deleteTier', () => {
    it('should delete a tier', async () => {
      api.tiers.delete.mockResolvedValue({ success: true });

      const result = await deleteTier('tier-1');

      expect(api.tiers.delete).toHaveBeenCalledWith('tier-1', expect.any(Object));
      expect(result).toEqual({ success: true });
    });

    it('should throw ValidationError when ID is missing', async () => {
      await expect(deleteTier()).rejects.toThrow('Tier ID is required for deletion');
    });

    it('should throw ValidationError when ID is empty string', async () => {
      await expect(deleteTier('')).rejects.toThrow('Tier ID is required for deletion');
    });

    it('should throw NotFoundError when tier does not exist', async () => {
      const mockError = new Error('Tier not found');
      mockError.response = { status: 404 };

      api.tiers.delete.mockRejectedValue(mockError);

      await expect(deleteTier('nonexistent-id')).rejects.toThrow();
    });
  });
});
