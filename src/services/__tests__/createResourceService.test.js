import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { mockGhostApiModule } from '../../__tests__/helpers/mockGhostApi.js';

// Mock the Ghost Admin API using shared mock factory
vi.mock('@tryghost/admin-api', () => mockGhostApiModule());

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock fs for validators
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
  },
}));

import { createResourceService } from '../createResourceService.js';
import { api, ghostCircuitBreaker } from '../ghostApiClient.js';
import { GhostAPIError, ValidationError, NotFoundError } from '../../errors/index.js';

describe('createResourceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset circuit breaker state between tests so error tests don't trip it open
    ghostCircuitBreaker.state = 'CLOSED';
    ghostCircuitBreaker.failureCount = 0;
    ghostCircuitBreaker.lastFailureTime = null;
    ghostCircuitBreaker.nextAttempt = null;
  });

  describe('create', () => {
    it('should create a resource via handleApiRequest', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      const data = { title: 'Test Post', html: '<p>Hello</p>' };
      const expected = { id: '1', ...data };
      api.posts.add.mockResolvedValue(expected);

      const result = await service.create(data);

      expect(result).toEqual(expected);
      expect(api.posts.add).toHaveBeenCalledWith(data, {});
    });

    it('should merge createDefaults into data', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        createDefaults: { status: 'draft' },
      });

      const data = { title: 'Test Post', html: '<p>Hello</p>' };
      api.posts.add.mockResolvedValue({ id: '1', ...data, status: 'draft' });

      await service.create(data);

      expect(api.posts.add).toHaveBeenCalledWith(
        { status: 'draft', title: 'Test Post', html: '<p>Hello</p>' },
        {}
      );
    });

    it('should allow data to override createDefaults', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        createDefaults: { status: 'draft' },
      });

      const data = { title: 'Test', html: '<p>Hi</p>', status: 'published' };
      api.posts.add.mockResolvedValue({ id: '1', ...data });

      await service.create(data);

      expect(api.posts.add).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' }),
        {}
      );
    });

    it('should pass createOptions to the API call', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        createOptions: { source: 'html' },
      });

      const data = { title: 'Test' };
      api.posts.add.mockResolvedValue({ id: '1', ...data });

      await service.create(data);

      expect(api.posts.add).toHaveBeenCalledWith(data, { source: 'html' });
    });

    it('should merge caller options with createOptions', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        createOptions: { source: 'html' },
      });

      const data = { title: 'Test' };
      api.posts.add.mockResolvedValue({ id: '1', ...data });

      await service.create(data, { formats: 'mobiledoc' });

      expect(api.posts.add).toHaveBeenCalledWith(data, { source: 'html', formats: 'mobiledoc' });
    });

    it('should call validateCreate before creating', async () => {
      const validateCreate = vi.fn();
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        validateCreate,
      });

      const data = { title: 'Test' };
      api.posts.add.mockResolvedValue({ id: '1', ...data });

      await service.create(data);

      expect(validateCreate).toHaveBeenCalledWith(data);
      expect(validateCreate).toHaveBeenCalledBefore(api.posts.add);
    });

    it('should support async validateCreate', async () => {
      const validateCreate = vi.fn().mockResolvedValue(undefined);
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        validateCreate,
      });

      const data = { title: 'Test' };
      api.posts.add.mockResolvedValue({ id: '1', ...data });

      await service.create(data);

      expect(validateCreate).toHaveBeenCalledWith(data);
      expect(api.posts.add).toHaveBeenCalled();
    });

    it('should not call API if validateCreate throws', async () => {
      const validateCreate = vi.fn(() => {
        throw new ValidationError('Invalid data');
      });
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        validateCreate,
      });

      await expect(service.create({ title: '' })).rejects.toThrow(ValidationError);
      expect(api.posts.add).not.toHaveBeenCalled();
    });

    it('should convert 422 errors to ValidationError', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      const ghostError = new Error('Validation failed');
      ghostError.response = { status: 422 };
      api.posts.add.mockRejectedValue(ghostError);

      await expect(service.create({ title: 'Test' })).rejects.toThrow(ValidationError);
    });

    it('should re-throw non-422 errors', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      const error = new Error('Server Error');
      error.response = { status: 500 };
      api.posts.add.mockRejectedValue(error);

      await expect(service.create({ title: 'Test' })).rejects.toThrow(GhostAPIError);
    });
  });

  describe('update', () => {
    it('should update a resource with OCC', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      const existing = { id: 'post-1', title: 'Old', updated_at: '2024-01-01T00:00:00.000Z' };
      const updated = { ...existing, title: 'New' };

      api.posts.read.mockResolvedValue(existing);
      api.posts.edit.mockResolvedValue(updated);

      const result = await service.update('post-1', { title: 'New' });

      expect(result).toEqual(updated);
      expect(api.posts.read).toHaveBeenCalledWith({}, { id: 'post-1' });
      expect(api.posts.edit).toHaveBeenCalledWith(
        { id: 'post-1', title: 'New', updated_at: '2024-01-01T00:00:00.000Z' },
        {}
      );
    });

    it('should throw ValidationError if ID is missing', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      await expect(service.update(undefined, { title: 'New' })).rejects.toThrow(ValidationError);
      await expect(service.update('', { title: 'New' })).rejects.toThrow('Post ID is required');
    });

    it('should call validateUpdate before updating', async () => {
      const validateUpdate = vi.fn();
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        validateUpdate,
      });

      const existing = { id: 'post-1', updated_at: '2024-01-01T00:00:00.000Z' };
      api.posts.read.mockResolvedValue(existing);
      api.posts.edit.mockResolvedValue(existing);

      await service.update('post-1', { title: 'New' });

      expect(validateUpdate).toHaveBeenCalledWith('post-1', { title: 'New' });
    });

    it('should support async validateUpdate', async () => {
      const validateUpdate = vi.fn().mockResolvedValue(undefined);
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        validateUpdate,
      });

      const existing = { id: 'post-1', updated_at: '2024-01-01T00:00:00.000Z' };
      api.posts.read.mockResolvedValue(existing);
      api.posts.edit.mockResolvedValue(existing);

      await service.update('post-1', { title: 'New' });

      expect(validateUpdate).toHaveBeenCalled();
    });

    it('should catch 422 on update when catch422OnUpdate is true', async () => {
      const service = createResourceService({
        resource: 'newsletters',
        label: 'Newsletter',
        catch422OnUpdate: true,
      });

      const existing = { id: 'nl-1', updated_at: '2024-01-01T00:00:00.000Z' };
      api.newsletters.read.mockResolvedValue(existing);

      const ghostError = new Error('Name already exists');
      ghostError.response = { status: 422 };
      api.newsletters.edit.mockRejectedValue(ghostError);

      try {
        await service.update('nl-1', { name: 'Dupe' });
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toBe('Newsletter update failed');
      }
    });

    it('should not catch 422 on update when catch422OnUpdate is false', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        catch422OnUpdate: false,
      });

      const existing = { id: 'post-1', updated_at: '2024-01-01T00:00:00.000Z' };
      api.posts.read.mockResolvedValue(existing);

      const ghostError = new Error('Something');
      ghostError.response = { status: 422 };
      api.posts.edit.mockRejectedValue(ghostError);

      await expect(service.update('post-1', { title: 'New' })).rejects.toThrow(GhostAPIError);
    });
  });

  describe('remove', () => {
    it('should delete a resource by ID', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      api.posts.delete.mockResolvedValue({ id: 'post-1' });

      const result = await service.remove('post-1');

      expect(result).toEqual({ id: 'post-1' });
      expect(api.posts.delete).toHaveBeenCalledWith('post-1', {});
    });

    it('should throw ValidationError if ID is missing', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      await expect(service.remove()).rejects.toThrow(ValidationError);
      await expect(service.remove()).rejects.toThrow('Post ID is required');
    });

    it('should throw NotFoundError when resource does not exist', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      api.posts.delete.mockRejectedValue(ghostError);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getOne', () => {
    it('should retrieve a resource by ID', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      const expected = { id: 'post-1', title: 'Test' };
      api.posts.read.mockResolvedValue(expected);

      const result = await service.getOne('post-1');

      expect(result).toEqual(expected);
      expect(api.posts.read).toHaveBeenCalledWith({}, { id: 'post-1' });
    });

    it('should pass options to read', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      api.posts.read.mockResolvedValue({ id: 'post-1' });

      await service.getOne('post-1', { include: 'tags' });

      expect(api.posts.read).toHaveBeenCalledWith({ include: 'tags' }, { id: 'post-1' });
    });

    it('should throw ValidationError if ID is missing', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      await expect(service.getOne()).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when resource does not exist', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      api.posts.read.mockRejectedValue(ghostError);

      await expect(service.getOne('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getList', () => {
    it('should list resources with defaults', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        listDefaults: { limit: 15, include: 'tags,authors' },
      });

      const expected = [{ id: '1' }, { id: '2' }];
      api.posts.browse.mockResolvedValue(expected);

      const result = await service.getList();

      expect(result).toEqual(expected);
      expect(api.posts.browse).toHaveBeenCalledWith({ limit: 15, include: 'tags,authors' }, {});
    });

    it('should allow overriding defaults', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
        listDefaults: { limit: 15, include: 'tags,authors' },
      });

      api.posts.browse.mockResolvedValue([]);

      await service.getList({ limit: 5, filter: 'status:published' });

      expect(api.posts.browse).toHaveBeenCalledWith(
        { limit: 5, include: 'tags,authors', filter: 'status:published' },
        {}
      );
    });

    it('should return empty array when API returns null/undefined', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      api.posts.browse.mockResolvedValue(null);

      const result = await service.getList();

      expect(result).toEqual([]);
    });

    it('should return empty array when API returns empty array', async () => {
      const service = createResourceService({
        resource: 'posts',
        label: 'Post',
      });

      api.posts.browse.mockResolvedValue([]);

      const result = await service.getList();

      expect(result).toEqual([]);
    });

    it('should use default limit of 15 when no listDefaults provided', async () => {
      const service = createResourceService({
        resource: 'tags',
        label: 'Tag',
      });

      api.tags.browse.mockResolvedValue([]);

      await service.getList();

      expect(api.tags.browse).toHaveBeenCalledWith({ limit: 15 }, {});
    });
  });
});
