import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

// Mock the Ghost Admin API with members support
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
import { createMember, updateMember, deleteMember, api } from '../ghostServiceImproved.js';

describe('ghostServiceImproved - Members', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('createMember', () => {
    it('should create a member with required email', async () => {
      const memberData = {
        email: 'test@example.com',
      };

      const mockCreatedMember = {
        id: 'member-1',
        email: 'test@example.com',
        status: 'free',
      };

      api.members.add.mockResolvedValue(mockCreatedMember);

      const result = await createMember(memberData);

      expect(api.members.add).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockCreatedMember);
    });

    it('should create a member with optional fields', async () => {
      const memberData = {
        email: 'test@example.com',
        name: 'John Doe',
        note: 'Test member',
        labels: ['premium', 'newsletter'],
        newsletters: [{ id: 'newsletter-1' }],
        subscribed: true,
      };

      const mockCreatedMember = {
        id: 'member-1',
        ...memberData,
        status: 'free',
      };

      api.members.add.mockResolvedValue(mockCreatedMember);

      const result = await createMember(memberData);

      expect(api.members.add).toHaveBeenCalledWith(
        expect.objectContaining(memberData),
        expect.any(Object)
      );
      expect(result).toEqual(mockCreatedMember);
    });

    it('should throw validation error for missing email', async () => {
      await expect(createMember({})).rejects.toThrow('Member validation failed');
    });

    it('should throw validation error for invalid email', async () => {
      await expect(createMember({ email: 'invalid-email' })).rejects.toThrow(
        'Member validation failed'
      );
    });

    it('should throw validation error for invalid labels type', async () => {
      await expect(
        createMember({
          email: 'test@example.com',
          labels: 'premium',
        })
      ).rejects.toThrow('Member validation failed');
    });

    it('should handle Ghost API errors', async () => {
      const memberData = {
        email: 'test@example.com',
      };

      api.members.add.mockRejectedValue(new Error('Ghost API Error'));

      await expect(createMember(memberData)).rejects.toThrow();
    });
  });

  describe('updateMember', () => {
    it('should update a member with valid ID and data', async () => {
      const memberId = 'member-1';
      const updateData = {
        name: 'Jane Doe',
        note: 'Updated note',
      };

      const mockExistingMember = {
        id: memberId,
        email: 'test@example.com',
        name: 'John Doe',
        updated_at: '2023-01-01T00:00:00.000Z',
      };

      const mockUpdatedMember = {
        ...mockExistingMember,
        ...updateData,
      };

      api.members.read.mockResolvedValue(mockExistingMember);
      api.members.edit.mockResolvedValue(mockUpdatedMember);

      const result = await updateMember(memberId, updateData);

      expect(api.members.read).toHaveBeenCalledWith(expect.any(Object), { id: memberId });
      expect(api.members.edit).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockExistingMember,
          ...updateData,
        }),
        expect.objectContaining({ id: memberId })
      );
      expect(result).toEqual(mockUpdatedMember);
    });

    it('should update member email if provided', async () => {
      const memberId = 'member-1';
      const updateData = {
        email: 'newemail@example.com',
      };

      const mockExistingMember = {
        id: memberId,
        email: 'test@example.com',
        updated_at: '2023-01-01T00:00:00.000Z',
      };

      const mockUpdatedMember = {
        ...mockExistingMember,
        email: 'newemail@example.com',
      };

      api.members.read.mockResolvedValue(mockExistingMember);
      api.members.edit.mockResolvedValue(mockUpdatedMember);

      const result = await updateMember(memberId, updateData);

      expect(result.email).toBe('newemail@example.com');
    });

    it('should throw validation error for missing member ID', async () => {
      await expect(updateMember(null, { name: 'Test' })).rejects.toThrow(
        'Member ID is required for update'
      );
    });

    it('should throw validation error for invalid email in update', async () => {
      await expect(updateMember('member-1', { email: 'invalid-email' })).rejects.toThrow(
        'Member validation failed'
      );
    });

    it('should throw not found error if member does not exist', async () => {
      api.members.read.mockRejectedValue({
        response: { status: 404 },
        message: 'Member not found',
      });

      await expect(updateMember('non-existent', { name: 'Test' })).rejects.toThrow();
    });
  });

  describe('deleteMember', () => {
    it('should delete a member with valid ID', async () => {
      const memberId = 'member-1';

      api.members.delete.mockResolvedValue({ deleted: true });

      const result = await deleteMember(memberId);

      expect(api.members.delete).toHaveBeenCalledWith(memberId, expect.any(Object));
      expect(result).toEqual({ deleted: true });
    });

    it('should throw validation error for missing member ID', async () => {
      await expect(deleteMember(null)).rejects.toThrow('Member ID is required for deletion');
    });

    it('should throw not found error if member does not exist', async () => {
      api.members.delete.mockRejectedValue({
        response: { status: 404 },
        message: 'Member not found',
      });

      await expect(deleteMember('non-existent')).rejects.toThrow();
    });
  });
});
