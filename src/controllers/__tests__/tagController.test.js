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

// Mock ghostService functions
vi.mock('../../services/ghostService.js', () => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
}));

// Import after mocks are set up
import { getTags, createTag } from '../tagController.js';
import * as ghostService from '../../services/ghostService.js';

describe('tagController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTags', () => {
    it('should return 200 with tags array on success', async () => {
      const mockTags = [
        { id: '1', name: 'Technology', slug: 'technology' },
        { id: '2', name: 'Science', slug: 'science' },
      ];
      ghostService.getTags.mockResolvedValue(mockTags);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await getTags(req, res, next);

      expect(ghostService.getTags).toHaveBeenCalledWith({});
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockTags);
      expect(next).not.toHaveBeenCalled();
    });

    it('should filter tags by name when name query parameter is provided', async () => {
      const mockTags = [{ id: '1', name: 'Technology', slug: 'technology' }];
      ghostService.getTags.mockResolvedValue(mockTags);

      const req = createMockRequest({ query: { name: 'Technology' } });
      const res = createMockResponse();
      const next = createMockNext();

      await getTags(req, res, next);

      expect(ghostService.getTags).toHaveBeenCalledWith({ filter: "name:'Technology'" });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockTags);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() with error when service throws error', async () => {
      const mockError = new Error('Failed to fetch tags');
      ghostService.getTags.mockRejectedValue(mockError);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await getTags(req, res, next);

      expect(ghostService.getTags).toHaveBeenCalledWith({});
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should return 400 when name contains invalid characters', async () => {
      const req = createMockRequest({ query: { name: "'; DROP TABLE tags; --" } });
      const res = createMockResponse();
      const next = createMockNext();

      await getTags(req, res, next);

      expect(ghostService.getTags).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Tag name contains invalid characters' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass through additional query parameters', async () => {
      const mockTags = [{ id: '1', name: 'Tech', slug: 'tech' }];
      ghostService.getTags.mockResolvedValue(mockTags);

      const req = createMockRequest({
        query: {
          limit: '10',
          order: 'name asc',
          include: 'count.posts',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await getTags(req, res, next);

      expect(ghostService.getTags).toHaveBeenCalledWith({
        limit: '10',
        order: 'name asc',
        include: 'count.posts',
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('createTag', () => {
    it('should return 201 with new tag on success', async () => {
      const mockTag = { id: '1', name: 'New Tag', slug: 'new-tag' };
      ghostService.createTag.mockResolvedValue(mockTag);

      const req = createMockRequest({
        body: {
          name: 'New Tag',
          description: 'A new tag description',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createTag(req, res, next);

      expect(ghostService.createTag).toHaveBeenCalledWith({
        name: 'New Tag',
        description: 'A new tag description',
        slug: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockTag);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when name is missing', async () => {
      const req = createMockRequest({
        body: {
          description: 'A tag without a name',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createTag(req, res, next);

      expect(ghostService.createTag).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Tag name is required.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when name is empty string', async () => {
      const req = createMockRequest({
        body: {
          name: '',
          description: 'A tag with empty name',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createTag(req, res, next);

      expect(ghostService.createTag).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Tag name is required.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() with error when service throws error', async () => {
      const mockError = new Error('Failed to create tag');
      ghostService.createTag.mockRejectedValue(mockError);

      const req = createMockRequest({
        body: {
          name: 'Test Tag',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createTag(req, res, next);

      expect(ghostService.createTag).toHaveBeenCalledWith({
        name: 'Test Tag',
        description: undefined,
        slug: undefined,
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should include slug when provided', async () => {
      const mockTag = { id: '1', name: 'Custom Tag', slug: 'custom-slug' };
      ghostService.createTag.mockResolvedValue(mockTag);

      const req = createMockRequest({
        body: {
          name: 'Custom Tag',
          slug: 'custom-slug',
          description: 'A tag with custom slug',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createTag(req, res, next);

      expect(ghostService.createTag).toHaveBeenCalledWith({
        name: 'Custom Tag',
        slug: 'custom-slug',
        description: 'A tag with custom slug',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockTag);
    });

    it('should pass through additional fields', async () => {
      const mockTag = { id: '1', name: 'Tag', slug: 'tag', visibility: 'public' };
      ghostService.createTag.mockResolvedValue(mockTag);

      const req = createMockRequest({
        body: {
          name: 'Tag',
          visibility: 'public',
          meta_title: 'Custom Meta Title',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await createTag(req, res, next);

      expect(ghostService.createTag).toHaveBeenCalledWith({
        name: 'Tag',
        description: undefined,
        slug: undefined,
        visibility: 'public',
        meta_title: 'Custom Meta Title',
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
