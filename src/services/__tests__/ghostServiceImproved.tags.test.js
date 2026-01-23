import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

// Mock the Ghost Admin API with tags support
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
  getTags,
  getTag,
  createTag,
  updateTag,
  deleteTag,
  api,
  ghostCircuitBreaker,
} from '../ghostServiceImproved.js';

describe('ghostServiceImproved - Tags', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Reset circuit breaker to closed state
    if (ghostCircuitBreaker) {
      ghostCircuitBreaker.state = 'CLOSED';
      ghostCircuitBreaker.failureCount = 0;
      ghostCircuitBreaker.lastFailureTime = null;
      ghostCircuitBreaker.nextAttempt = null;
    }
  });

  describe('getTags', () => {
    it('should return all tags with default options', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'JavaScript', slug: 'javascript' },
        { id: 'tag-2', name: 'TypeScript', slug: 'typescript' },
      ];

      api.tags.browse.mockResolvedValue(mockTags);

      const result = await getTags();

      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 15,
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockTags);
    });

    it('should accept custom limit option', async () => {
      const mockTags = [{ id: 'tag-1', name: 'JavaScript', slug: 'javascript' }];

      api.tags.browse.mockResolvedValue(mockTags);

      await getTags({ limit: 50 });

      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        }),
        expect.any(Object)
      );
    });

    it('should accept pagination options (page)', async () => {
      const mockTags = [{ id: 'tag-1', name: 'JavaScript', slug: 'javascript' }];

      api.tags.browse.mockResolvedValue(mockTags);

      await getTags({ limit: 20, page: 2 });

      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          page: 2,
        }),
        expect.any(Object)
      );
    });

    it('should accept filter options', async () => {
      const mockTags = [{ id: 'tag-1', name: 'JavaScript', slug: 'javascript' }];

      api.tags.browse.mockResolvedValue(mockTags);

      await getTags({ filter: "name:'JavaScript'" });

      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 15,
          filter: "name:'JavaScript'",
        }),
        expect.any(Object)
      );
    });

    it('should accept order options', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'JavaScript', slug: 'javascript' },
        { id: 'tag-2', name: 'TypeScript', slug: 'typescript' },
      ];

      api.tags.browse.mockResolvedValue(mockTags);

      await getTags({ order: 'name asc' });

      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 15,
          order: 'name asc',
        }),
        expect.any(Object)
      );
    });

    it('should accept include options', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'JavaScript', slug: 'javascript', count: { posts: 10 } },
      ];

      api.tags.browse.mockResolvedValue(mockTags);

      await getTags({ include: 'count.posts' });

      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 15,
          include: 'count.posts',
        }),
        expect.any(Object)
      );
    });

    it('should accept multiple options together', async () => {
      const mockTags = [{ id: 'tag-1', name: 'JavaScript', slug: 'javascript' }];

      api.tags.browse.mockResolvedValue(mockTags);

      await getTags({
        limit: 25,
        page: 3,
        filter: 'visibility:public',
        order: 'slug desc',
        include: 'count.posts',
      });

      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 25,
          page: 3,
          filter: 'visibility:public',
          order: 'slug desc',
          include: 'count.posts',
        }),
        expect.any(Object)
      );
    });

    it('should return empty array when no tags found', async () => {
      api.tags.browse.mockResolvedValue([]);

      const result = await getTags();

      expect(result).toEqual([]);
    });

    it('should return empty array when API returns null', async () => {
      api.tags.browse.mockResolvedValue(null);

      const result = await getTags();

      expect(result).toEqual([]);
    });

    it('should handle Ghost API errors', async () => {
      const apiError = new Error('Ghost API Error');
      api.tags.browse.mockRejectedValue(apiError);

      // Errors are wrapped by handleApiRequest with "External service error: Ghost API"
      await expect(getTags()).rejects.toThrow(/External service error: Ghost API/);
    });

    it('should handle network errors with retry logic', async () => {
      const networkError = new Error('Network timeout');
      api.tags.browse.mockRejectedValue(networkError);

      // Network errors are wrapped by handleApiRequest
      await expect(getTags()).rejects.toThrow(/External service error: Ghost API/);
    });

    it('should reject requests when circuit breaker is open', async () => {
      // Force circuit breaker to open state
      ghostCircuitBreaker.state = 'OPEN';
      ghostCircuitBreaker.nextAttempt = Date.now() + 60000;

      await expect(getTags()).rejects.toThrow(/circuit.*open/i);
    });

    it('should succeed when circuit breaker is closed', async () => {
      const mockTags = [{ id: 'tag-1', name: 'JavaScript', slug: 'javascript' }];

      // Ensure circuit breaker is closed
      ghostCircuitBreaker.state = 'CLOSED';
      api.tags.browse.mockResolvedValue(mockTags);

      const result = await getTags();

      expect(result).toEqual(mockTags);
      expect(api.tags.browse).toHaveBeenCalled();
    });
  });

  describe('getTag', () => {
    it('should get tag by ID', async () => {
      const mockTag = {
        id: 'tag-1',
        name: 'JavaScript',
        slug: 'javascript',
      };

      api.tags.read.mockResolvedValue(mockTag);

      const result = await getTag('tag-1');

      expect(api.tags.read).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({}));
      expect(result).toEqual(mockTag);
    });

    it('should throw validation error for missing tag ID', async () => {
      await expect(getTag(null)).rejects.toThrow('Tag ID is required');
    });

    it('should throw not found error when tag does not exist', async () => {
      api.tags.read.mockRejectedValue({
        response: { status: 404 },
        message: 'Tag not found',
      });

      await expect(getTag('non-existent')).rejects.toThrow();
    });
  });

  describe('createTag', () => {
    it('should create a tag with required name', async () => {
      const tagData = {
        name: 'JavaScript',
      };

      const mockCreatedTag = {
        id: 'tag-1',
        name: 'JavaScript',
        slug: 'javascript',
      };

      api.tags.add.mockResolvedValue(mockCreatedTag);

      const result = await createTag(tagData);

      expect(api.tags.add).toHaveBeenCalled();
      expect(result).toEqual(mockCreatedTag);
    });

    it('should throw validation error for missing tag name', async () => {
      await expect(createTag({})).rejects.toThrow('Tag validation failed');
    });

    it('should throw validation error for empty tag name', async () => {
      await expect(createTag({ name: '   ' })).rejects.toThrow('Tag validation failed');
    });

    it('should throw validation error for invalid slug format', async () => {
      await expect(createTag({ name: 'Test', slug: 'INVALID_SLUG!' })).rejects.toThrow(
        'Tag validation failed'
      );
    });

    it('should accept valid slug with lowercase letters, numbers, and hyphens', async () => {
      const tagData = {
        name: 'Test Tag',
        slug: 'valid-slug-123',
      };

      const mockCreatedTag = {
        id: 'tag-1',
        name: 'Test Tag',
        slug: 'valid-slug-123',
      };

      api.tags.add.mockResolvedValue(mockCreatedTag);

      const result = await createTag(tagData);

      expect(result).toEqual(mockCreatedTag);
    });

    it('should auto-generate slug if not provided', async () => {
      const tagData = {
        name: 'JavaScript & TypeScript',
      };

      const mockCreatedTag = {
        id: 'tag-1',
        name: 'JavaScript & TypeScript',
        slug: 'javascript-typescript',
      };

      api.tags.add.mockResolvedValue(mockCreatedTag);

      await createTag(tagData);

      // Verify that slug is auto-generated
      expect(api.tags.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'JavaScript & TypeScript',
          slug: expect.stringMatching(/javascript-typescript/),
        }),
        expect.any(Object)
      );
    });

    it('should handle duplicate tag errors gracefully', async () => {
      const tagData = {
        name: 'JavaScript',
      };

      // First call fails with duplicate error
      api.tags.add.mockRejectedValue({
        response: { status: 422 },
        message: 'Tag already exists',
      });

      // getTags returns existing tag when called with name filter
      api.tags.browse.mockResolvedValue([{ id: 'tag-1', name: 'JavaScript', slug: 'javascript' }]);

      const result = await createTag(tagData);

      // Verify getTags was called with correct filter for duplicate lookup
      expect(api.tags.browse).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: "name:'JavaScript'",
        }),
        expect.any(Object)
      );
      expect(result).toEqual({ id: 'tag-1', name: 'JavaScript', slug: 'javascript' });
    });
  });

  describe('updateTag', () => {
    it('should update tag with valid ID and data', async () => {
      const tagId = 'tag-1';
      const updateData = {
        name: 'Updated JavaScript',
        description: 'Updated description',
      };

      const mockExistingTag = {
        id: tagId,
        name: 'JavaScript',
        slug: 'javascript',
      };

      const mockUpdatedTag = {
        ...mockExistingTag,
        ...updateData,
      };

      api.tags.read.mockResolvedValue(mockExistingTag);
      api.tags.edit.mockResolvedValue(mockUpdatedTag);

      const result = await updateTag(tagId, updateData);

      expect(api.tags.read).toHaveBeenCalled();
      expect(api.tags.edit).toHaveBeenCalled();
      expect(result).toEqual(mockUpdatedTag);
    });

    it('should throw validation error for missing tag ID', async () => {
      await expect(updateTag(null, { name: 'Test' })).rejects.toThrow(
        'Tag ID is required for update'
      );
    });

    it('should throw not found error if tag does not exist', async () => {
      api.tags.read.mockRejectedValue({
        response: { status: 404 },
        message: 'Tag not found',
      });

      await expect(updateTag('non-existent', { name: 'Test' })).rejects.toThrow();
    });
  });

  describe('deleteTag', () => {
    it('should delete tag with valid ID', async () => {
      const tagId = 'tag-1';

      api.tags.delete.mockResolvedValue({ deleted: true });

      const result = await deleteTag(tagId);

      expect(api.tags.delete).toHaveBeenCalledWith(tagId, expect.any(Object));
      expect(result).toEqual({ deleted: true });
    });

    it('should throw validation error for missing tag ID', async () => {
      await expect(deleteTag(null)).rejects.toThrow('Tag ID is required for deletion');
    });

    it('should throw not found error if tag does not exist', async () => {
      api.tags.delete.mockRejectedValue({
        response: { status: 404 },
        message: 'Tag not found',
      });

      await expect(deleteTag('non-existent')).rejects.toThrow();
    });
  });
});
