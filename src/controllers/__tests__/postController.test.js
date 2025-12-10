import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../__tests__/helpers/mockExpress.js';

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock postService functions
vi.mock('../../services/postService.js', () => ({
  createPostService: vi.fn(),
}));

// Import after mocks are set up
import { createPost } from '../postController.js';
import * as postService from '../../services/postService.js';

describe('postController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPost', () => {
    it('should return 201 with new post on success', async () => {
      const mockPost = {
        id: '1',
        title: 'Test Post',
        html: '<p>Test content</p>',
        status: 'draft',
      };
      postService.createPostService.mockResolvedValue(mockPost);

      const req = createMockRequest({
        body: {
          title: 'Test Post',
          html: '<p>Test content</p>',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createPost(req, res, next);

      expect(postService.createPostService).toHaveBeenCalledWith({
        title: 'Test Post',
        html: '<p>Test content</p>',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPost);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass through all post fields including feature_image', async () => {
      const mockPost = {
        id: '1',
        title: 'Post with Image',
        html: '<p>Content</p>',
        feature_image: 'https://example.com/image.jpg',
        status: 'published',
      };
      postService.createPostService.mockResolvedValue(mockPost);

      const req = createMockRequest({
        body: {
          title: 'Post with Image',
          html: '<p>Content</p>',
          feature_image: 'https://example.com/image.jpg',
          status: 'published',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createPost(req, res, next);

      expect(postService.createPostService).toHaveBeenCalledWith({
        title: 'Post with Image',
        html: '<p>Content</p>',
        feature_image: 'https://example.com/image.jpg',
        status: 'published',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPost);
    });

    it('should handle posts with tags', async () => {
      const mockPost = {
        id: '1',
        title: 'Tagged Post',
        html: '<p>Content</p>',
        tags: [{ name: 'Technology' }, { name: 'Science' }],
        status: 'draft',
      };
      postService.createPostService.mockResolvedValue(mockPost);

      const req = createMockRequest({
        body: {
          title: 'Tagged Post',
          html: '<p>Content</p>',
          tags: [{ name: 'Technology' }, { name: 'Science' }],
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createPost(req, res, next);

      expect(postService.createPostService).toHaveBeenCalledWith({
        title: 'Tagged Post',
        html: '<p>Content</p>',
        tags: [{ name: 'Technology' }, { name: 'Science' }],
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPost);
    });

    it('should handle posts with metadata', async () => {
      const mockPost = {
        id: '1',
        title: 'Post with Metadata',
        html: '<p>Content</p>',
        meta_title: 'SEO Title',
        meta_description: 'SEO Description',
        status: 'draft',
      };
      postService.createPostService.mockResolvedValue(mockPost);

      const req = createMockRequest({
        body: {
          title: 'Post with Metadata',
          html: '<p>Content</p>',
          meta_title: 'SEO Title',
          meta_description: 'SEO Description',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createPost(req, res, next);

      expect(postService.createPostService).toHaveBeenCalledWith({
        title: 'Post with Metadata',
        html: '<p>Content</p>',
        meta_title: 'SEO Title',
        meta_description: 'SEO Description',
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should call next() with error when service throws error', async () => {
      const mockError = new Error('Failed to create post');
      postService.createPostService.mockRejectedValue(mockError);

      const req = createMockRequest({
        body: {
          title: 'Test Post',
          html: '<p>Test content</p>',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createPost(req, res, next);

      expect(postService.createPostService).toHaveBeenCalledWith({
        title: 'Test Post',
        html: '<p>Test content</p>',
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should handle validation errors from service', async () => {
      const validationError = new Error('Validation failed: title is required');
      validationError.name = 'ValidationError';
      postService.createPostService.mockRejectedValue(validationError);

      const req = createMockRequest({
        body: {
          html: '<p>Content without title</p>',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createPost(req, res, next);

      expect(next).toHaveBeenCalledWith(validationError);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle scheduled posts', async () => {
      const scheduledDate = '2025-12-31T00:00:00Z';
      const mockPost = {
        id: '1',
        title: 'Scheduled Post',
        html: '<p>Future content</p>',
        status: 'scheduled',
        published_at: scheduledDate,
      };
      postService.createPostService.mockResolvedValue(mockPost);

      const req = createMockRequest({
        body: {
          title: 'Scheduled Post',
          html: '<p>Future content</p>',
          status: 'scheduled',
          published_at: scheduledDate,
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createPost(req, res, next);

      expect(postService.createPostService).toHaveBeenCalledWith({
        title: 'Scheduled Post',
        html: '<p>Future content</p>',
        status: 'scheduled',
        published_at: scheduledDate,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPost);
    });
  });
});
