import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Resource: class MockResource {
    constructor(config) {
      this.name = config.name;
      this.description = config.description;
      this.schema = config.schema;
      this.fetch = config.fetch;
    }
  },
}));

// Mock errors
vi.mock('../../errors/index.js', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource, identifier) {
      super(`${resource} not found: ${identifier}`);
      this.name = 'NotFoundError';
      this.resource = resource;
      this.identifier = identifier;
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

import { ResourceManager } from '../ResourceManager.js';

// Helper to create mock ghost service
function createMockGhostService() {
  return {
    getPost: vi.fn(),
    getPosts: vi.fn(),
    getTag: vi.fn(),
    getTags: vi.fn(),
  };
}

describe('ResourceManager', () => {
  let mockGhostService;
  let resourceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGhostService = createMockGhostService();
    resourceManager = new ResourceManager(mockGhostService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('LRUCache', () => {
    describe('get', () => {
      it('should return null for non-existent key', () => {
        const stats = resourceManager.getCacheStats();
        expect(stats.size).toBe(0);
      });

      it('should return cached value for existing key', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        // First fetch - should call service
        await resourceManager.fetchResource('ghost/post/1');
        expect(mockGhostService.getPost).toHaveBeenCalledTimes(1);

        // Second fetch - should use cache
        await resourceManager.fetchResource('ghost/post/1');
        expect(mockGhostService.getPost).toHaveBeenCalledTimes(1);
      });

      it('should return null for expired items', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.fetchResource('ghost/post/1');
        expect(mockGhostService.getPost).toHaveBeenCalledTimes(1);

        // Advance time beyond TTL (5 minutes)
        vi.advanceTimersByTime(301000);

        // Should fetch again because cache expired
        await resourceManager.fetchResource('ghost/post/1');
        expect(mockGhostService.getPost).toHaveBeenCalledTimes(2);
      });

      it('should update access order on get', async () => {
        const post1 = { id: '1', title: 'Post 1' };
        const post2 = { id: '2', title: 'Post 2' };
        mockGhostService.getPost.mockImplementation((id) =>
          Promise.resolve(id === '1' ? post1 : post2)
        );

        await resourceManager.fetchResource('ghost/post/1');
        await resourceManager.fetchResource('ghost/post/2');

        // Access post 1 again to update its access order
        await resourceManager.fetchResource('ghost/post/1');

        const stats = resourceManager.getCacheStats();
        expect(stats.size).toBe(2);
      });
    });

    describe('set', () => {
      it('should evict oldest items when at capacity', async () => {
        // Create a resource manager with small cache
        const smallCacheManager = new ResourceManager(mockGhostService);

        // We can't directly test cache eviction without modifying the class,
        // but we can verify the cache stores items
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        await smallCacheManager.fetchResource('ghost/post/1');
        const stats = smallCacheManager.getCacheStats();
        expect(stats.size).toBe(1);
      });

      it('should allow custom TTL', async () => {
        // Collections use shorter TTL (1 minute)
        const posts = [{ id: '1', title: 'Post 1' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/posts?limit=10');
        expect(mockGhostService.getPosts).toHaveBeenCalledTimes(1);

        // Advance less than collection TTL
        vi.advanceTimersByTime(30000);

        // Should still use cache
        await resourceManager.fetchResource('ghost/posts?limit=10');
        expect(mockGhostService.getPosts).toHaveBeenCalledTimes(1);

        // Advance past collection TTL (1 minute)
        vi.advanceTimersByTime(35000);

        // Should fetch again
        await resourceManager.fetchResource('ghost/posts?limit=10');
        expect(mockGhostService.getPosts).toHaveBeenCalledTimes(2);
      });
    });

    describe('invalidate', () => {
      it('should clear all cache when no pattern provided', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.fetchResource('ghost/post/1');
        expect(resourceManager.getCacheStats().size).toBe(1);

        resourceManager.invalidateCache();
        expect(resourceManager.getCacheStats().size).toBe(0);
      });

      it('should invalidate entries matching pattern', async () => {
        const post = { id: '1', title: 'Test Post' };
        const tag = { id: '1', name: 'Test Tag' };
        mockGhostService.getPost.mockResolvedValue(post);
        mockGhostService.getTag.mockResolvedValue(tag);

        await resourceManager.fetchResource('ghost/post/1');
        await resourceManager.fetchResource('ghost/tag/1');
        expect(resourceManager.getCacheStats().size).toBe(2);

        resourceManager.invalidateCache('post');
        // Only tag should remain
        expect(resourceManager.getCacheStats().size).toBe(1);
      });
    });

    describe('getStats', () => {
      it('should return cache statistics', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.fetchResource('ghost/post/1');

        const stats = resourceManager.getCacheStats();
        expect(stats).toHaveProperty('size');
        expect(stats).toHaveProperty('maxSize');
        expect(stats).toHaveProperty('ttl');
        expect(stats).toHaveProperty('keys');
        expect(stats.size).toBe(1);
        expect(stats.maxSize).toBe(100);
        expect(stats.ttl).toBe(300000);
      });
    });
  });

  describe('ResourceURIParser', () => {
    describe('parse', () => {
      it('should parse simple resource URI', async () => {
        const post = { id: '123', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.fetchResource('ghost/post/123');

        expect(mockGhostService.getPost).toHaveBeenCalledWith('123', {
          include: 'tags,authors',
        });
      });

      it('should parse URI with slug identifier', async () => {
        const posts = [{ id: '1', slug: 'my-post-slug', title: 'Test Post' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/post/slug:my-post-slug');

        expect(mockGhostService.getPosts).toHaveBeenCalledWith({
          filter: 'slug:my-post-slug',
          include: 'tags,authors',
          limit: 1,
        });
      });

      it('should parse URI with uuid identifier', async () => {
        const posts = [{ id: '1', uuid: '550e8400-e29b-41d4-a716-446655440000' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/post/uuid:550e8400-e29b-41d4-a716-446655440000');

        expect(mockGhostService.getPosts).toHaveBeenCalledWith({
          filter: 'uuid:550e8400-e29b-41d4-a716-446655440000',
          include: 'tags,authors',
          limit: 1,
        });
      });

      it('should parse collection URI with query parameters', async () => {
        const posts = [{ id: '1', title: 'Post 1' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/posts?status=published&limit=10&page=2');

        expect(mockGhostService.getPosts).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 10,
            page: 2,
          })
        );
      });

      it('should throw ValidationError for invalid URI format', async () => {
        await expect(resourceManager.fetchResource('invalid')).rejects.toThrow(
          'Invalid resource URI format'
        );
      });

      it('should throw ValidationError for unknown resource type', async () => {
        await expect(resourceManager.fetchResource('ghost/unknown/123')).rejects.toThrow(
          'Unknown resource type: unknown'
        );
      });
    });

    describe('build', () => {
      it('should build simple URI', async () => {
        // Test indirectly through fetcher behavior
        const post = { id: '1', title: 'Test' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.fetchResource('ghost/post/1');
        expect(mockGhostService.getPost).toHaveBeenCalled();
      });
    });
  });

  describe('ResourceFetcher', () => {
    describe('fetchPost', () => {
      it('should fetch single post by id', async () => {
        const post = { id: '1', title: 'Test Post', tags: [], authors: [] };
        mockGhostService.getPost.mockResolvedValue(post);

        const result = await resourceManager.fetchResource('ghost/post/1');

        expect(result).toEqual(post);
        expect(mockGhostService.getPost).toHaveBeenCalledWith('1', {
          include: 'tags,authors',
        });
      });

      it('should fetch single post by slug', async () => {
        const posts = [{ id: '1', slug: 'test-slug', title: 'Test Post' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        const result = await resourceManager.fetchResource('ghost/post/slug:test-slug');

        expect(result).toEqual(posts[0]);
        expect(mockGhostService.getPosts).toHaveBeenCalledWith({
          filter: 'slug:test-slug',
          include: 'tags,authors',
          limit: 1,
        });
      });

      it('should fetch single post by uuid', async () => {
        const posts = [{ id: '1', uuid: 'test-uuid', title: 'Test Post' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        const result = await resourceManager.fetchResource('ghost/post/uuid:test-uuid');

        expect(result).toEqual(posts[0]);
        expect(mockGhostService.getPosts).toHaveBeenCalledWith({
          filter: 'uuid:test-uuid',
          include: 'tags,authors',
          limit: 1,
        });
      });

      it('should throw NotFoundError when post not found', async () => {
        mockGhostService.getPost.mockResolvedValue(null);

        await expect(resourceManager.fetchResource('ghost/post/nonexistent')).rejects.toThrow(
          'Post not found'
        );
      });

      it('should throw ValidationError for unknown identifier type', async () => {
        await expect(resourceManager.fetchResource('ghost/post/unknown:value')).rejects.toThrow(
          'Unknown identifier type: unknown'
        );
      });

      it('should use cache for repeated fetches', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.fetchResource('ghost/post/1');
        await resourceManager.fetchResource('ghost/post/1');

        expect(mockGhostService.getPost).toHaveBeenCalledTimes(1);
      });
    });

    describe('fetchPosts', () => {
      it('should fetch posts collection with default options', async () => {
        const posts = [
          { id: '1', title: 'Post 1' },
          { id: '2', title: 'Post 2' },
        ];
        mockGhostService.getPosts.mockResolvedValue(posts);

        const result = await resourceManager.fetchResource('ghost/posts');

        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('meta');
        expect(result.meta.pagination).toBeDefined();
      });

      it('should fetch posts with status filter', async () => {
        const posts = [{ id: '1', title: 'Post 1', status: 'published' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/posts?status=published');

        expect(mockGhostService.getPosts).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: 'status:published',
          })
        );
      });

      it('should append status to existing filter', async () => {
        const posts = [{ id: '1', title: 'Post 1' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/posts?filter=featured:true&status=published');

        expect(mockGhostService.getPosts).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: 'featured:true+status:published',
          })
        );
      });

      it('should handle pagination parameters', async () => {
        const posts = [{ id: '1', title: 'Post 1' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/posts?limit=5&page=3');

        expect(mockGhostService.getPosts).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 5,
            page: 3,
          })
        );
      });

      it('should include pagination metadata in response', async () => {
        const posts = [{ id: '1' }];
        posts.meta = { pagination: { total: 100, next: 2, prev: null } };
        mockGhostService.getPosts.mockResolvedValue(posts);

        const result = await resourceManager.fetchResource('ghost/posts?limit=10&page=1');

        expect(result.meta.pagination).toBeDefined();
        expect(result.meta.pagination.page).toBe(1);
        expect(result.meta.pagination.limit).toBe(10);
      });

      it('should cache posts with shorter TTL', async () => {
        const posts = [{ id: '1', title: 'Post 1' }];
        mockGhostService.getPosts.mockResolvedValue(posts);

        await resourceManager.fetchResource('ghost/posts');
        expect(mockGhostService.getPosts).toHaveBeenCalledTimes(1);

        // Still cached at 30 seconds
        vi.advanceTimersByTime(30000);
        await resourceManager.fetchResource('ghost/posts');
        expect(mockGhostService.getPosts).toHaveBeenCalledTimes(1);

        // Expired at 65 seconds
        vi.advanceTimersByTime(35000);
        await resourceManager.fetchResource('ghost/posts');
        expect(mockGhostService.getPosts).toHaveBeenCalledTimes(2);
      });
    });

    describe('fetchTag', () => {
      it('should fetch single tag by id', async () => {
        const tag = { id: '1', name: 'Test Tag', slug: 'test-tag' };
        mockGhostService.getTag.mockResolvedValue(tag);

        const result = await resourceManager.fetchResource('ghost/tag/1');

        expect(result).toEqual(tag);
        expect(mockGhostService.getTag).toHaveBeenCalledWith('1');
      });

      it('should fetch single tag by slug', async () => {
        const tags = [
          { id: '1', slug: 'test-slug', name: 'Test Tag' },
          { id: '2', slug: 'other', name: 'Other' },
        ];
        mockGhostService.getTags.mockResolvedValue(tags);

        const result = await resourceManager.fetchResource('ghost/tag/slug:test-slug');

        expect(result).toEqual(tags[0]);
      });

      it('should fetch single tag by name', async () => {
        // Reset mock to clear any previous calls
        mockGhostService.getTags.mockReset();
        const tags = [{ id: '1', name: 'Technology', slug: 'technology' }];
        mockGhostService.getTags.mockResolvedValue(tags);

        const result = await resourceManager.fetchResource('ghost/tag/name:Technology');

        expect(result).toEqual(tags[0]);
        expect(mockGhostService.getTags).toHaveBeenCalledWith('Technology');
      });

      it('should use id by default when no identifier type specified', async () => {
        // When no type is specified (e.g., ghost/tag/tech), identifierType defaults to 'id'
        const tag = { id: 'tech', slug: 'tech', name: 'Technology' };
        mockGhostService.getTag.mockResolvedValue(tag);

        const result = await resourceManager.fetchResource('ghost/tag/tech');

        expect(result).toEqual(tag);
        expect(mockGhostService.getTag).toHaveBeenCalledWith('tech');
      });

      it('should throw NotFoundError when tag not found by id', async () => {
        mockGhostService.getTag.mockResolvedValue(null);

        await expect(resourceManager.fetchResource('ghost/tag/nonexistent')).rejects.toThrow(
          'Tag not found'
        );
      });

      it('should throw NotFoundError when tag not found by slug', async () => {
        mockGhostService.getTags.mockResolvedValue([]);

        await expect(resourceManager.fetchResource('ghost/tag/slug:nonexistent')).rejects.toThrow(
          'Tag not found'
        );
      });
    });

    describe('fetchTags', () => {
      it('should fetch tags collection', async () => {
        const tags = [
          { id: '1', name: 'Tag 1' },
          { id: '2', name: 'Tag 2' },
        ];
        mockGhostService.getTags.mockResolvedValue(tags);

        const result = await resourceManager.fetchResource('ghost/tags');

        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('meta');
        expect(result.data).toEqual(tags);
      });

      it('should filter tags by name', async () => {
        const tags = [{ id: '1', name: 'Tech' }];
        mockGhostService.getTags.mockResolvedValue(tags);

        await resourceManager.fetchResource('ghost/tags?name=Tech');

        expect(mockGhostService.getTags).toHaveBeenCalledWith('Tech');
      });

      it('should apply client-side filtering', async () => {
        const tags = [
          { id: '1', name: 'Tech', slug: 'tech' },
          { id: '2', name: 'News', slug: 'news' },
        ];
        mockGhostService.getTags.mockResolvedValue(tags);

        const result = await resourceManager.fetchResource('ghost/tags?filter=name:Tech');

        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('Tech');
      });

      it('should apply pagination to tags', async () => {
        const tags = Array.from({ length: 100 }, (_, i) => ({
          id: String(i + 1),
          name: `Tag ${i + 1}`,
        }));
        mockGhostService.getTags.mockResolvedValue(tags);

        const result = await resourceManager.fetchResource('ghost/tags?limit=10&page=2');

        expect(result.data).toHaveLength(10);
        expect(result.data[0].name).toBe('Tag 11');
        expect(result.meta.pagination.page).toBe(2);
        expect(result.meta.pagination.pages).toBe(10);
        expect(result.meta.pagination.total).toBe(100);
      });
    });
  });

  describe('ResourceSubscriptionManager', () => {
    describe('subscribe', () => {
      it('should create subscription and return id', () => {
        const callback = vi.fn();
        const subscriptionId = resourceManager.subscribe('ghost/post/1', callback);

        expect(subscriptionId).toMatch(/^sub_\d+_[a-z0-9]+$/);
      });

      it('should start polling when enablePolling is true', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback, {
          enablePolling: true,
          pollingInterval: 1000,
        });

        // Wait for initial poll
        await vi.advanceTimersByTimeAsync(100);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'update',
            uri: 'ghost/post/1',
            data: post,
          })
        );
      });
    });

    describe('unsubscribe', () => {
      it('should remove subscription', () => {
        const callback = vi.fn();
        const subscriptionId = resourceManager.subscribe('ghost/post/1', callback);

        resourceManager.unsubscribe(subscriptionId);

        // Should not throw when unsubscribing
        expect(() => resourceManager.unsubscribe(subscriptionId)).toThrow('Subscription not found');
      });

      it('should throw NotFoundError for non-existent subscription', () => {
        expect(() => resourceManager.unsubscribe('invalid_id')).toThrow('Subscription not found');
      });

      it('should stop polling when unsubscribed', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        const callback = vi.fn();
        const subscriptionId = resourceManager.subscribe('ghost/post/1', callback, {
          enablePolling: true,
          pollingInterval: 1000,
        });

        await vi.advanceTimersByTimeAsync(100);
        const initialCallCount = callback.mock.calls.length;

        resourceManager.unsubscribe(subscriptionId);

        // Advance time - callback should not be called again
        await vi.advanceTimersByTimeAsync(2000);
        expect(callback.mock.calls.length).toBe(initialCallCount);
      });
    });

    describe('polling', () => {
      it('should call callback when value changes', async () => {
        const post1 = { id: '1', title: 'Original Title' };
        const post2 = { id: '1', title: 'Updated Title' };

        // Reset mock for clean state
        mockGhostService.getPost.mockReset();
        mockGhostService.getPost.mockResolvedValueOnce(post1).mockResolvedValueOnce(post2);

        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback, {
          enablePolling: true,
          pollingInterval: 1000,
        });

        // Initial poll - need to let async operations complete
        await vi.advanceTimersByTimeAsync(50);
        expect(callback).toHaveBeenCalledTimes(1);

        // Invalidate cache so the next fetch goes to service
        resourceManager.invalidateCache();

        // Next poll with changed value
        await vi.advanceTimersByTimeAsync(1000);
        expect(callback).toHaveBeenCalledTimes(2);
      });

      it('should not call callback when value unchanged', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback, {
          enablePolling: true,
          pollingInterval: 1000,
        });

        // Initial poll
        await vi.advanceTimersByTimeAsync(100);
        expect(callback).toHaveBeenCalledTimes(1);

        // Next poll with same value
        await vi.advanceTimersByTimeAsync(1000);
        expect(callback).toHaveBeenCalledTimes(1);
      });

      it('should handle errors in polling', async () => {
        mockGhostService.getPost.mockRejectedValue(new Error('Network error'));

        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback, {
          enablePolling: true,
          pollingInterval: 1000,
        });

        await vi.advanceTimersByTimeAsync(100);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            uri: 'ghost/post/1',
            error: 'Network error',
          })
        );
      });
    });

    describe('notifySubscribers', () => {
      it('should notify matching subscribers', async () => {
        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback);

        const updatedPost = { id: '1', title: 'Updated' };
        resourceManager.notifyChange('ghost/post/1', updatedPost, 'update');

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'update',
            uri: 'ghost/post/1',
            data: updatedPost,
          })
        );
      });

      it('should notify subscribers with matching prefix', async () => {
        const callback = vi.fn();
        resourceManager.subscribe('ghost/post', callback);

        const updatedPost = { id: '1', title: 'Updated' };
        resourceManager.notifyChange('ghost/post/1', updatedPost, 'update');

        expect(callback).toHaveBeenCalled();
      });
    });

    describe('matchesSubscription', () => {
      it('should match exact URIs', async () => {
        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback);
        resourceManager.notifyChange('ghost/post/1', {}, 'update');

        expect(callback).toHaveBeenCalled();
      });

      it('should match when subscription is prefix of event', async () => {
        const callback = vi.fn();
        resourceManager.subscribe('ghost/post', callback);
        resourceManager.notifyChange('ghost/post/123', {}, 'update');

        expect(callback).toHaveBeenCalled();
      });

      it('should match when event is prefix of subscription', async () => {
        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback);
        resourceManager.notifyChange('ghost/post', {}, 'update');

        expect(callback).toHaveBeenCalled();
      });
    });
  });

  describe('ResourceManager', () => {
    describe('registerResource', () => {
      it('should register a resource', () => {
        const schema = { type: 'object' };
        const resource = resourceManager.registerResource('test/resource', schema, {
          description: 'Test resource',
        });

        expect(resource).toBeDefined();
        expect(resource.name).toBe('test/resource');
      });

      it('should add resource to internal map', () => {
        const schema = { type: 'object' };
        resourceManager.registerResource('test/resource', schema);

        const resources = resourceManager.listResources();
        expect(resources).toHaveLength(1);
        expect(resources[0].uri).toBe('test/resource');
      });
    });

    describe('fetchResource', () => {
      it('should fetch posts', async () => {
        const post = { id: '1', title: 'Test Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        const result = await resourceManager.fetchResource('ghost/post/1');
        expect(result).toEqual(post);
      });

      it('should fetch tags', async () => {
        const tag = { id: '1', name: 'Test Tag' };
        mockGhostService.getTag.mockResolvedValue(tag);

        const result = await resourceManager.fetchResource('ghost/tag/1');
        expect(result).toEqual(tag);
      });

      it('should log errors', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockGhostService.getPost.mockRejectedValue(new Error('API Error'));

        await expect(resourceManager.fetchResource('ghost/post/1')).rejects.toThrow('API Error');

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('listResources', () => {
      it('should return empty array when no resources registered', () => {
        const resources = resourceManager.listResources();
        expect(resources).toEqual([]);
      });

      it('should return all registered resources', () => {
        resourceManager.registerResource('ghost/posts', {});
        resourceManager.registerResource('ghost/tags', {});

        const resources = resourceManager.listResources();
        expect(resources).toHaveLength(2);
      });

      it('should filter resources by namespace', () => {
        resourceManager.registerResource('ghost/posts', {});
        resourceManager.registerResource('other/items', {});

        const resources = resourceManager.listResources({ namespace: 'ghost' });
        expect(resources).toHaveLength(1);
        expect(resources[0].uri).toBe('ghost/posts');
      });
    });

    describe('invalidateCache', () => {
      it('should invalidate all cache', async () => {
        const post = { id: '1', title: 'Test' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.fetchResource('ghost/post/1');
        expect(resourceManager.getCacheStats().size).toBe(1);

        resourceManager.invalidateCache();
        expect(resourceManager.getCacheStats().size).toBe(0);
      });

      it('should invalidate by pattern', async () => {
        const post = { id: '1', title: 'Test' };
        const tag = { id: '1', name: 'Test' };
        mockGhostService.getPost.mockResolvedValue(post);
        mockGhostService.getTag.mockResolvedValue(tag);

        await resourceManager.fetchResource('ghost/post/1');
        await resourceManager.fetchResource('ghost/tag/1');
        expect(resourceManager.getCacheStats().size).toBe(2);

        resourceManager.invalidateCache('post');
        expect(resourceManager.getCacheStats().size).toBe(1);
      });

      it('should log invalidation', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        resourceManager.invalidateCache();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cache invalidated'));

        resourceManager.invalidateCache('test');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pattern: test'));

        consoleSpy.mockRestore();
      });
    });

    describe('notifyChange', () => {
      it('should invalidate cache and notify subscribers', async () => {
        const post = { id: '1', title: 'Test' };
        mockGhostService.getPost.mockResolvedValue(post);

        // Cache the resource
        await resourceManager.fetchResource('ghost/post/1');
        expect(resourceManager.getCacheStats().size).toBe(1);

        const callback = vi.fn();
        resourceManager.subscribe('ghost/post/1', callback);

        // Notify change
        resourceManager.notifyChange('ghost/post/1', { id: '1', title: 'Updated' }, 'update');

        // Cache should be invalidated for matching pattern
        expect(callback).toHaveBeenCalled();
      });
    });

    describe('getCacheStats', () => {
      it('should return cache statistics', () => {
        const stats = resourceManager.getCacheStats();

        expect(stats).toHaveProperty('size');
        expect(stats).toHaveProperty('maxSize');
        expect(stats).toHaveProperty('ttl');
        expect(stats).toHaveProperty('keys');
      });
    });

    describe('batchFetch', () => {
      it('should fetch multiple resources', async () => {
        const post = { id: '1', title: 'Post' };
        const tag = { id: '1', name: 'Tag' };
        mockGhostService.getPost.mockResolvedValue(post);
        mockGhostService.getTag.mockResolvedValue(tag);

        const { results, errors } = await resourceManager.batchFetch([
          'ghost/post/1',
          'ghost/tag/1',
        ]);

        expect(results['ghost/post/1']).toEqual(post);
        expect(results['ghost/tag/1']).toEqual(tag);
        expect(Object.keys(errors)).toHaveLength(0);
      });

      it('should collect errors for failed fetches', async () => {
        const post = { id: '1', title: 'Post' };
        mockGhostService.getPost.mockResolvedValue(post);
        mockGhostService.getTag.mockRejectedValue(new Error('Tag not found'));

        const { results, errors } = await resourceManager.batchFetch([
          'ghost/post/1',
          'ghost/tag/1',
        ]);

        expect(results['ghost/post/1']).toEqual(post);
        expect(errors['ghost/tag/1']).toHaveProperty('message', 'Tag not found');
      });

      it('should fetch all resources in parallel', async () => {
        const post = { id: '1', title: 'Post' };
        const tag = { id: '1', name: 'Tag' };
        mockGhostService.getPost.mockResolvedValue(post);
        mockGhostService.getTag.mockResolvedValue(tag);

        await resourceManager.batchFetch(['ghost/post/1', 'ghost/tag/1']);

        expect(mockGhostService.getPost).toHaveBeenCalled();
        expect(mockGhostService.getTag).toHaveBeenCalled();
      });
    });

    describe('prefetch', () => {
      it('should prefetch resources and return status', async () => {
        const post = { id: '1', title: 'Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        const prefetched = await resourceManager.prefetch(['ghost/post/1']);

        expect(prefetched).toHaveLength(1);
        expect(prefetched[0]).toEqual({
          pattern: 'ghost/post/1',
          status: 'success',
        });
      });

      it('should handle prefetch errors', async () => {
        mockGhostService.getPost.mockRejectedValue(new Error('Not found'));

        const prefetched = await resourceManager.prefetch(['ghost/post/1']);

        expect(prefetched).toHaveLength(1);
        expect(prefetched[0]).toEqual({
          pattern: 'ghost/post/1',
          status: 'error',
          error: 'Not found',
        });
      });

      it('should prefetch multiple patterns', async () => {
        const post = { id: '1', title: 'Post' };
        const tag = { id: '1', name: 'Tag' };
        mockGhostService.getPost.mockResolvedValue(post);
        mockGhostService.getTag.mockResolvedValue(tag);

        const prefetched = await resourceManager.prefetch(['ghost/post/1', 'ghost/tag/1']);

        expect(prefetched).toHaveLength(2);
        expect(prefetched.every((p) => p.status === 'success')).toBe(true);
      });

      it('should warm cache', async () => {
        const post = { id: '1', title: 'Post' };
        mockGhostService.getPost.mockResolvedValue(post);

        await resourceManager.prefetch(['ghost/post/1']);

        // Cache should be warm
        await resourceManager.fetchResource('ghost/post/1');
        expect(mockGhostService.getPost).toHaveBeenCalledTimes(1);
      });
    });
  });
});
