import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

// Mock the Ghost Admin API with posts support
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
import { updatePost, api, validators } from '../ghostServiceImproved.js';
import { updatePostSchema } from '../../schemas/postSchemas.js';

describe('ghostServiceImproved - Posts (updatePost)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updatePost', () => {
    it('should send only update fields and updated_at, not the full existing post', async () => {
      const postId = 'post-123';
      const existingPost = {
        id: postId,
        uuid: 'abc-def-123',
        title: 'Original Title',
        slug: 'original-title',
        html: '<p>Original content</p>',
        status: 'published',
        url: 'https://example.com/original-title',
        comment_id: 'comment-123',
        reading_time: 3,
        updated_at: '2024-01-01T00:00:00.000Z',
        created_at: '2023-12-01T00:00:00.000Z',
      };
      const updateData = { title: 'Updated Title' };
      const expectedResult = { ...existingPost, title: 'Updated Title' };

      api.posts.read.mockResolvedValue(existingPost);
      api.posts.edit.mockResolvedValue(expectedResult);

      const result = await updatePost(postId, updateData);

      expect(result).toEqual(expectedResult);
      // Should send ONLY updateData + updated_at, NOT the full existing post
      expect(api.posts.edit).toHaveBeenCalledWith(
        { title: 'Updated Title', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: postId }
      );
      // Verify read-only fields are NOT sent
      const editCallData = api.posts.edit.mock.calls[0][0];
      expect(editCallData).not.toHaveProperty('uuid');
      expect(editCallData).not.toHaveProperty('url');
      expect(editCallData).not.toHaveProperty('comment_id');
      expect(editCallData).not.toHaveProperty('reading_time');
      expect(editCallData).not.toHaveProperty('created_at');
    });

    it('should preserve updated_at from existing post for OCC', async () => {
      const postId = 'post-123';
      const existingPost = {
        id: postId,
        title: 'Original',
        updated_at: '2024-06-15T12:30:00.000Z',
      };
      api.posts.read.mockResolvedValue(existingPost);
      api.posts.edit.mockResolvedValue({ ...existingPost, title: 'Updated' });

      await updatePost(postId, { title: 'Updated' });

      const editCall = api.posts.edit.mock.calls[0][0];
      expect(editCall.updated_at).toBe('2024-06-15T12:30:00.000Z');
    });

    it('should throw error when post ID is missing', async () => {
      await expect(updatePost(null, { title: 'Updated' })).rejects.toThrow(
        'Post ID is required for update'
      );
      await expect(updatePost('', { title: 'Updated' })).rejects.toThrow(
        'Post ID is required for update'
      );
    });

    it('should handle post not found (404)', async () => {
      const error404 = new Error('Post not found');
      error404.response = { status: 404 };
      api.posts.read.mockRejectedValue(error404);

      await expect(updatePost('nonexistent-id', { title: 'Updated' })).rejects.toThrow(
        'Post not found'
      );
    });

    it('should throw ValidationError when updating to scheduled without published_at', async () => {
      const postId = 'post-123';
      const existingPost = {
        id: postId,
        title: 'Test Post',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      api.posts.read.mockResolvedValue(existingPost);

      await expect(updatePost(postId, { status: 'scheduled' })).rejects.toThrow(
        'Post validation failed'
      );
    });

    it('should allow updating to scheduled with valid future published_at', async () => {
      const postId = 'post-123';
      const existingPost = {
        id: postId,
        title: 'Test Post',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const updateData = { status: 'scheduled', published_at: futureDate };

      api.posts.read.mockResolvedValue(existingPost);
      api.posts.edit.mockResolvedValue({ ...existingPost, ...updateData });

      const result = await updatePost(postId, updateData);

      expect(result).toBeDefined();
      expect(api.posts.edit).toHaveBeenCalledWith(
        { ...updateData, updated_at: existingPost.updated_at },
        { id: postId }
      );
    });
  });

  describe('validators.validateScheduledStatus', () => {
    it('should throw when status is scheduled without published_at', () => {
      expect(() => validators.validateScheduledStatus({ status: 'scheduled' })).toThrow(
        'validation failed'
      );
    });

    it('should throw when published_at has invalid date format', () => {
      expect(() => validators.validateScheduledStatus({ published_at: 'not-a-date' })).toThrow(
        'validation failed'
      );
    });

    it('should throw when scheduled date is in the past', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      expect(() =>
        validators.validateScheduledStatus({ status: 'scheduled', published_at: pastDate })
      ).toThrow('validation failed');
    });

    it('should not throw for valid scheduled status with future date', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      expect(() =>
        validators.validateScheduledStatus({ status: 'scheduled', published_at: futureDate })
      ).not.toThrow();
    });

    it('should not throw when status is not scheduled', () => {
      expect(() => validators.validateScheduledStatus({ status: 'draft' })).not.toThrow();
      expect(() => validators.validateScheduledStatus({ status: 'published' })).not.toThrow();
      expect(() => validators.validateScheduledStatus({})).not.toThrow();
    });
  });

  describe('HTML sanitization (schema + service integration)', () => {
    it('should strip XSS from post HTML on update when input flows through schema validation (production path)', async () => {
      const rawUpdate = { html: '<p>Safe</p><script>alert("xss")</script>' };
      const validated = updatePostSchema.parse(rawUpdate);

      const existingPost = { id: 'post-1', updated_at: '2024-01-01T00:00:00.000Z' };
      api.posts.read.mockResolvedValue(existingPost);
      api.posts.edit.mockResolvedValue({ ...existingPost, ...validated });

      await updatePost('post-1', validated);

      const sentToApi = api.posts.edit.mock.calls[0][0];
      expect(sentToApi.html).not.toContain('<script>');
      expect(sentToApi.html).not.toContain('alert');
      expect(sentToApi.html).toContain('<p>Safe</p>');
    });
  });
});
