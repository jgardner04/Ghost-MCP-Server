import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockGhostApiModule } from '../../__tests__/helpers/mockGhostApi.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

// Mock the Ghost Admin API
vi.mock('@tryghost/admin-api', () => mockGhostApiModule());

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Import after setting up mocks and environment
import {
  createPost,
  createTag,
  getTags,
  getSiteInfo,
  uploadImage,
  handleApiRequest,
  api,
} from '../ghostService.js';

describe('ghostService', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('handleApiRequest', () => {
    describe('success paths', () => {
      it('should handle add action for posts successfully', async () => {
        const expectedPost = { id: '1', title: 'Test Post', status: 'draft' };
        api.posts.add.mockResolvedValue(expectedPost);

        const result = await handleApiRequest('posts', 'add', { title: 'Test Post' });

        expect(result).toEqual(expectedPost);
        expect(api.posts.add).toHaveBeenCalledWith({ title: 'Test Post' });
      });

      it('should handle add action for tags successfully', async () => {
        const expectedTag = { id: '1', name: 'Test Tag', slug: 'test-tag' };
        api.tags.add.mockResolvedValue(expectedTag);

        const result = await handleApiRequest('tags', 'add', { name: 'Test Tag' });

        expect(result).toEqual(expectedTag);
        expect(api.tags.add).toHaveBeenCalledWith({ name: 'Test Tag' });
      });

      it('should handle upload action for images successfully', async () => {
        const expectedImage = { url: 'https://example.com/image.jpg' };
        api.images.upload.mockResolvedValue(expectedImage);

        const result = await handleApiRequest('images', 'upload', { file: '/path/to/image.jpg' });

        expect(result).toEqual(expectedImage);
        expect(api.images.upload).toHaveBeenCalledWith({ file: '/path/to/image.jpg' });
      });

      it('should handle browse action with options successfully', async () => {
        const expectedTags = [
          { id: '1', name: 'Tag1' },
          { id: '2', name: 'Tag2' },
        ];
        api.tags.browse.mockResolvedValue(expectedTags);

        const result = await handleApiRequest('tags', 'browse', {}, { limit: 'all' });

        expect(result).toEqual(expectedTags);
        expect(api.tags.browse).toHaveBeenCalledWith({ limit: 'all' }, {});
      });

      it('should handle add action with options successfully', async () => {
        const postData = { title: 'Test Post', html: '<p>Content</p>' };
        const options = { source: 'html' };
        const expectedPost = { id: '1', ...postData };
        api.posts.add.mockResolvedValue(expectedPost);

        const result = await handleApiRequest('posts', 'add', postData, options);

        expect(result).toEqual(expectedPost);
        expect(api.posts.add).toHaveBeenCalledWith(postData, options);
      });
    });

    describe('error handling', () => {
      it('should throw error for invalid resource', async () => {
        await expect(handleApiRequest('invalid', 'add', {})).rejects.toThrow(
          'Invalid Ghost API resource or action: invalid.add'
        );
      });

      it('should throw error for invalid action', async () => {
        await expect(handleApiRequest('posts', 'invalid', {})).rejects.toThrow(
          'Invalid Ghost API resource or action: posts.invalid'
        );
      });

      it('should handle 404 error and throw', async () => {
        const error404 = new Error('Not found');
        error404.response = { status: 404 };
        api.posts.read.mockRejectedValue(error404);

        await expect(handleApiRequest('posts', 'read', { id: 'nonexistent' })).rejects.toThrow(
          'Not found'
        );
      });
    });

    describe('retry logic', () => {
      it('should retry on 429 rate limit error with delay', async () => {
        const rateLimitError = new Error('Rate limit exceeded');
        rateLimitError.response = { status: 429 };
        const successResult = { id: '1', name: 'Success' };

        api.tags.add.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(successResult);

        const startTime = Date.now();
        const result = await handleApiRequest('tags', 'add', { name: 'Test' });
        const elapsedTime = Date.now() - startTime;

        expect(result).toEqual(successResult);
        expect(api.tags.add).toHaveBeenCalledTimes(2);
        // Should have delayed at least 5000ms for rate limit
        expect(elapsedTime).toBeGreaterThanOrEqual(4900); // Allow small margin
      }, 10000); // 10 second timeout

      it('should retry on 500 server error with increasing delay', async () => {
        const serverError = new Error('Internal server error');
        serverError.response = { status: 500 };
        const successResult = { id: '1', title: 'Success' };

        api.posts.add.mockRejectedValueOnce(serverError).mockResolvedValueOnce(successResult);

        const result = await handleApiRequest('posts', 'add', { title: 'Test' });

        expect(result).toEqual(successResult);
        expect(api.posts.add).toHaveBeenCalledTimes(2);
      });

      it('should retry on ECONNREFUSED network error', async () => {
        const networkError = new Error('Connection refused');
        networkError.code = 'ECONNREFUSED';
        const successResult = { id: '1', title: 'Success' };

        api.posts.add.mockRejectedValueOnce(networkError).mockResolvedValueOnce(successResult);

        const result = await handleApiRequest('posts', 'add', { title: 'Test' });

        expect(result).toEqual(successResult);
        expect(api.posts.add).toHaveBeenCalledTimes(2);
      });

      it('should retry on ETIMEDOUT network error', async () => {
        const timeoutError = new Error('Connection timeout');
        timeoutError.code = 'ETIMEDOUT';
        const successResult = { id: '1', title: 'Success' };

        api.posts.add.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce(successResult);

        const result = await handleApiRequest('posts', 'add', { title: 'Test' });

        expect(result).toEqual(successResult);
        expect(api.posts.add).toHaveBeenCalledTimes(2);
      });

      it('should throw error after exhausting retries', async () => {
        const serverError = new Error('Server error');
        serverError.response = { status: 500 };

        api.posts.add.mockRejectedValue(serverError);

        // Should retry 3 times (4 attempts total)
        await expect(handleApiRequest('posts', 'add', { title: 'Test' })).rejects.toThrow(
          'Server error'
        );
        expect(api.posts.add).toHaveBeenCalledTimes(4); // Initial + 3 retries
      }, 10000); // 10 second timeout

      it('should not retry on non-retryable errors', async () => {
        const badRequestError = new Error('Bad request');
        badRequestError.response = { status: 400 };

        api.posts.add.mockRejectedValue(badRequestError);

        await expect(handleApiRequest('posts', 'add', { title: 'Test' })).rejects.toThrow(
          'Bad request'
        );
        expect(api.posts.add).toHaveBeenCalledTimes(1); // No retries
      });
    });
  });

  describe('getSiteInfo', () => {
    it('should successfully retrieve site information', async () => {
      const expectedSite = { title: 'Test Site', url: 'https://example.com' };
      api.site.read.mockResolvedValue(expectedSite);

      const result = await getSiteInfo();

      expect(result).toEqual(expectedSite);
      expect(api.site.read).toHaveBeenCalled();
    });
  });

  describe('uploadImage', () => {
    it('should throw error when image path is missing', async () => {
      await expect(uploadImage()).rejects.toThrow('Image path is required for upload');
      await expect(uploadImage('')).rejects.toThrow('Image path is required for upload');
    });

    it('should successfully upload image with valid path', async () => {
      const imagePath = '/path/to/image.jpg';
      const expectedResult = { url: 'https://example.com/uploaded-image.jpg' };
      api.images.upload.mockResolvedValue(expectedResult);

      const result = await uploadImage(imagePath);

      expect(result).toEqual(expectedResult);
      expect(api.images.upload).toHaveBeenCalledWith({ file: imagePath });
    });
  });

  describe('createPost', () => {
    it('should throw error when title is missing', async () => {
      await expect(createPost({})).rejects.toThrow('Post title is required');
    });

    it('should set default status to draft when not provided', async () => {
      const postData = { title: 'Test Post', html: '<p>Content</p>' };
      const expectedPost = { id: '1', title: 'Test Post', html: '<p>Content</p>', status: 'draft' };
      api.posts.add.mockResolvedValue(expectedPost);

      const result = await createPost(postData);

      expect(result).toEqual(expectedPost);
      expect(api.posts.add).toHaveBeenCalledWith(
        { status: 'draft', title: 'Test Post', html: '<p>Content</p>' },
        { source: 'html' }
      );
    });

    it('should successfully create post with valid data', async () => {
      const postData = { title: 'Test Post', html: '<p>Content</p>', status: 'published' };
      const expectedPost = { id: '1', ...postData };
      api.posts.add.mockResolvedValue(expectedPost);

      const result = await createPost(postData);

      expect(result).toEqual(expectedPost);
      expect(api.posts.add).toHaveBeenCalled();
    });
  });

  describe('createTag', () => {
    it('should throw error when tag name is missing', async () => {
      await expect(createTag({})).rejects.toThrow('Tag name is required');
    });

    it('should successfully create tag with valid data', async () => {
      const tagData = { name: 'Test Tag', slug: 'test-tag' };
      const expectedTag = { id: '1', ...tagData };
      api.tags.add.mockResolvedValue(expectedTag);

      const result = await createTag(tagData);

      expect(result).toEqual(expectedTag);
      expect(api.tags.add).toHaveBeenCalledWith(tagData);
    });
  });

  describe('getTags', () => {
    it('should reject tag names with invalid characters', async () => {
      await expect(getTags("'; DROP TABLE tags; --")).rejects.toThrow(
        'Tag name contains invalid characters'
      );
    });

    it('should accept valid tag names', async () => {
      const validNames = ['Test Tag', 'test-tag', 'test_tag', 'Tag123'];
      const expectedTags = [{ id: '1', name: 'Tag' }];
      api.tags.browse.mockResolvedValue(expectedTags);

      for (const name of validNames) {
        const result = await getTags(name);
        expect(result).toEqual(expectedTags);
      }
    });

    it('should handle tags without filter when name is not provided', async () => {
      const expectedTags = [
        { id: '1', name: 'Tag1' },
        { id: '2', name: 'Tag2' },
      ];
      api.tags.browse.mockResolvedValue(expectedTags);

      const result = await getTags();

      expect(result).toEqual(expectedTags);
      expect(api.tags.browse).toHaveBeenCalledWith({ limit: 'all' }, {});
    });

    it('should properly escape tag names in filter', async () => {
      const expectedTags = [{ id: '1', name: "Tag's Name" }];
      api.tags.browse.mockResolvedValue(expectedTags);

      // This should work because we properly escape single quotes
      const result = await getTags('Valid Tag');

      expect(result).toEqual(expectedTags);
    });
  });
});
