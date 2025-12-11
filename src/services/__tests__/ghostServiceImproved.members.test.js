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
import {
  createMember,
  updateMember,
  deleteMember,
  getMembers,
  getMember,
  searchMembers,
  api,
} from '../ghostServiceImproved.js';

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

  describe('getMembers', () => {
    it('should return all members with default options', async () => {
      const mockMembers = [
        { id: 'member-1', email: 'test1@example.com', status: 'free' },
        { id: 'member-2', email: 'test2@example.com', status: 'paid' },
      ];

      api.members.browse.mockResolvedValue(mockMembers);

      const result = await getMembers();

      expect(api.members.browse).toHaveBeenCalled();
      expect(result).toEqual(mockMembers);
    });

    it('should accept pagination options', async () => {
      const mockMembers = [{ id: 'member-1', email: 'test1@example.com' }];

      api.members.browse.mockResolvedValue(mockMembers);

      await getMembers({ limit: 50, page: 2 });

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          page: 2,
        }),
        expect.any(Object)
      );
    });

    it('should accept filter options', async () => {
      const mockMembers = [{ id: 'member-1', email: 'test1@example.com', status: 'paid' }];

      api.members.browse.mockResolvedValue(mockMembers);

      await getMembers({ filter: 'status:paid' });

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: 'status:paid',
        }),
        expect.any(Object)
      );
    });

    it('should accept order options', async () => {
      const mockMembers = [{ id: 'member-1', email: 'test1@example.com' }];

      api.members.browse.mockResolvedValue(mockMembers);

      await getMembers({ order: 'created_at desc' });

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          order: 'created_at desc',
        }),
        expect.any(Object)
      );
    });

    it('should accept include options', async () => {
      const mockMembers = [
        { id: 'member-1', email: 'test1@example.com', labels: [], newsletters: [] },
      ];

      api.members.browse.mockResolvedValue(mockMembers);

      await getMembers({ include: 'labels,newsletters' });

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          include: 'labels,newsletters',
        }),
        expect.any(Object)
      );
    });

    it('should throw validation error for invalid limit', async () => {
      await expect(getMembers({ limit: 0 })).rejects.toThrow('Member query validation failed');
      await expect(getMembers({ limit: 101 })).rejects.toThrow('Member query validation failed');
    });

    it('should throw validation error for invalid page', async () => {
      await expect(getMembers({ page: 0 })).rejects.toThrow('Member query validation failed');
    });

    it('should return empty array when no members found', async () => {
      api.members.browse.mockResolvedValue([]);

      const result = await getMembers();

      expect(result).toEqual([]);
    });

    it('should handle Ghost API errors', async () => {
      api.members.browse.mockRejectedValue(new Error('Ghost API Error'));

      await expect(getMembers()).rejects.toThrow();
    });
  });

  describe('getMember', () => {
    it('should get member by ID', async () => {
      const mockMember = {
        id: 'member-1',
        email: 'test@example.com',
        name: 'John Doe',
        status: 'free',
      };

      api.members.read.mockResolvedValue(mockMember);

      const result = await getMember({ id: 'member-1' });

      expect(api.members.read).toHaveBeenCalledWith(expect.any(Object), { id: 'member-1' });
      expect(result).toEqual(mockMember);
    });

    it('should get member by email', async () => {
      const mockMember = {
        id: 'member-1',
        email: 'test@example.com',
        name: 'John Doe',
        status: 'free',
      };

      api.members.browse.mockResolvedValue([mockMember]);

      const result = await getMember({ email: 'test@example.com' });

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('test@example.com'),
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockMember);
    });

    it('should throw validation error when neither id nor email provided', async () => {
      await expect(getMember({})).rejects.toThrow('Member lookup validation failed');
    });

    it('should throw validation error for invalid email format', async () => {
      await expect(getMember({ email: 'invalid-email' })).rejects.toThrow(
        'Member lookup validation failed'
      );
    });

    it('should throw not found error when member not found by ID', async () => {
      api.members.read.mockRejectedValue({
        response: { status: 404 },
        message: 'Member not found',
      });

      await expect(getMember({ id: 'non-existent' })).rejects.toThrow();
    });

    it('should throw not found error when member not found by email', async () => {
      api.members.browse.mockResolvedValue([]);

      await expect(getMember({ email: 'notfound@example.com' })).rejects.toThrow(
        'Member not found'
      );
    });

    it('should prioritize ID over email when both provided', async () => {
      const mockMember = {
        id: 'member-1',
        email: 'test@example.com',
        status: 'free',
      };

      api.members.read.mockResolvedValue(mockMember);

      await getMember({ id: 'member-1', email: 'test@example.com' });

      // Should use read (ID) instead of browse (email)
      expect(api.members.read).toHaveBeenCalled();
      expect(api.members.browse).not.toHaveBeenCalled();
    });
  });

  describe('searchMembers', () => {
    it('should search members by query', async () => {
      const mockMembers = [{ id: 'member-1', email: 'john@example.com', name: 'John Doe' }];

      api.members.browse.mockResolvedValue(mockMembers);

      const result = await searchMembers('john');

      expect(api.members.browse).toHaveBeenCalled();
      expect(result).toEqual(mockMembers);
    });

    it('should apply default limit of 15', async () => {
      const mockMembers = [];

      api.members.browse.mockResolvedValue(mockMembers);

      await searchMembers('test');

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 15,
        }),
        expect.any(Object)
      );
    });

    it('should accept custom limit', async () => {
      const mockMembers = [];

      api.members.browse.mockResolvedValue(mockMembers);

      await searchMembers('test', { limit: 25 });

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 25,
        }),
        expect.any(Object)
      );
    });

    it('should throw validation error for empty query', async () => {
      await expect(searchMembers('')).rejects.toThrow('Search query validation failed');
      await expect(searchMembers('   ')).rejects.toThrow('Search query validation failed');
    });

    it('should throw validation error for non-string query', async () => {
      await expect(searchMembers(123)).rejects.toThrow('Search query validation failed');
      await expect(searchMembers(null)).rejects.toThrow('Search query validation failed');
    });

    it('should sanitize query to prevent NQL injection', async () => {
      const mockMembers = [];

      api.members.browse.mockResolvedValue(mockMembers);

      // Query with special NQL characters
      await searchMembers("test'value");

      expect(api.members.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining("\\'"),
        }),
        expect.any(Object)
      );
    });

    it('should return empty array when no matches found', async () => {
      api.members.browse.mockResolvedValue([]);

      const result = await searchMembers('nonexistent');

      expect(result).toEqual([]);
    });

    it('should handle Ghost API errors', async () => {
      api.members.browse.mockRejectedValue(new Error('Ghost API Error'));

      await expect(searchMembers('test')).rejects.toThrow();
    });
  });
});
