/**
 * Enhanced Resource Management System for MCP Server
 * Provides caching, pagination, filtering, and subscription capabilities
 */

import { Resource } from "@modelcontextprotocol/sdk/server/index.js";
import { NotFoundError, ValidationError, ErrorHandler } from "../errors/index.js";
import EventEmitter from 'events';

/**
 * LRU Cache implementation for resource caching
 */
class LRUCache {
  constructor(maxSize = 100, ttl = 300000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
    this.accessOrder = [];
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    // Check if expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return null;
    }
    
    // Update access order
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
    
    return item.value;
  }

  set(key, value, customTTL = null) {
    // Remove oldest items if at capacity
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift();
      this.cache.delete(oldestKey);
    }
    
    const ttl = customTTL || this.ttl;
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
    
    this.accessOrder.push(key);
  }

  invalidate(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      this.accessOrder = [];
      return;
    }
    
    // Invalidate entries matching pattern
    const regex = new RegExp(pattern);
    for (const [key] of this.cache) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      keys: Array.from(this.cache.keys())
    };
  }
}

/**
 * URI Parser for resource URIs
 */
class ResourceURIParser {
  static parse(uri) {
    // Support various URI formats:
    // - ghost/post/123
    // - ghost/post/slug:my-post-slug
    // - ghost/post/uuid:550e8400-e29b-41d4-a716-446655440000
    // - ghost/posts?status=published&limit=10&page=2
    // - ghost/tag/technology
    
    const url = new URL(uri, 'resource://');
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    if (pathParts.length < 2) {
      throw new ValidationError('Invalid resource URI format');
    }
    
    const [namespace, resourceType, ...identifierParts] = pathParts;
    const identifier = identifierParts.join('/');
    
    // Parse query parameters
    const query = {};
    for (const [key, value] of url.searchParams) {
      query[key] = value;
    }
    
    // Parse identifier type
    let identifierType = 'id';
    let identifierValue = identifier;
    
    if (identifier && identifier.includes(':')) {
      const [type, ...valueParts] = identifier.split(':');
      identifierType = type;
      identifierValue = valueParts.join(':');
    }
    
    return {
      namespace,
      resourceType,
      identifier: identifierValue,
      identifierType,
      query,
      isCollection: !identifier || Object.keys(query).length > 0
    };
  }

  static build(parts) {
    const { namespace, resourceType, identifier, query = {} } = parts;
    
    let uri = `${namespace}/${resourceType}`;
    
    if (identifier) {
      uri += `/${identifier}`;
    }
    
    const queryString = new URLSearchParams(query).toString();
    if (queryString) {
      uri += `?${queryString}`;
    }
    
    return uri;
  }
}

/**
 * Resource Fetcher with advanced capabilities
 */
class ResourceFetcher {
  constructor(ghostService, cache) {
    this.ghostService = ghostService;
    this.cache = cache;
  }

  async fetchPost(parsedURI) {
    const { identifier, identifierType, query, isCollection } = parsedURI;
    
    if (isCollection) {
      return await this.fetchPosts(query);
    }
    
    const cacheKey = `post:${identifierType}:${identifier}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return cached;
    }
    
    // Fetch from Ghost
    let post;
    
    switch (identifierType) {
      case 'id':
        post = await this.ghostService.getPost(identifier, { include: 'tags,authors' });
        break;
        
      case 'slug':
        const posts = await this.ghostService.getPosts({ 
          filter: `slug:${identifier}`,
          include: 'tags,authors',
          limit: 1
        });
        post = posts[0];
        break;
        
      case 'uuid':
        const postsByUuid = await this.ghostService.getPosts({
          filter: `uuid:${identifier}`,
          include: 'tags,authors',
          limit: 1
        });
        post = postsByUuid[0];
        break;
        
      default:
        throw new ValidationError(`Unknown identifier type: ${identifierType}`);
    }
    
    if (!post) {
      throw new NotFoundError('Post', identifier);
    }
    
    // Cache the result
    this.cache.set(cacheKey, post);
    
    return post;
  }

  async fetchPosts(query = {}) {
    // Build cache key from query
    const cacheKey = `posts:${JSON.stringify(query)}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for posts query`);
      return cached;
    }
    
    // Parse query parameters
    const options = {
      limit: parseInt(query.limit) || 15,
      page: parseInt(query.page) || 1,
      include: query.include || 'tags,authors',
      filter: query.filter,
      order: query.order || 'published_at desc'
    };
    
    // Add status filter if provided
    if (query.status) {
      options.filter = options.filter 
        ? `${options.filter}+status:${query.status}`
        : `status:${query.status}`;
    }
    
    // Fetch from Ghost
    const result = await this.ghostService.getPosts(options);
    
    // Format response with pagination metadata
    const response = {
      data: result,
      meta: {
        pagination: {
          page: options.page,
          limit: options.limit,
          pages: Math.ceil(result.meta?.pagination?.total / options.limit) || 1,
          total: result.meta?.pagination?.total || result.length,
          next: result.meta?.pagination?.next || null,
          prev: result.meta?.pagination?.prev || null
        }
      }
    };
    
    // Cache with shorter TTL for collections
    this.cache.set(cacheKey, response, 60000); // 1 minute for collections
    
    return response;
  }

  async fetchTag(parsedURI) {
    const { identifier, identifierType, query, isCollection } = parsedURI;
    
    if (isCollection) {
      return await this.fetchTags(query);
    }
    
    const cacheKey = `tag:${identifierType}:${identifier}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return cached;
    }
    
    // Fetch from Ghost
    let tag;
    
    switch (identifierType) {
      case 'id':
        tag = await this.ghostService.getTag(identifier);
        break;
        
      case 'slug':
        const tags = await this.ghostService.getTags();
        tag = tags.find(t => t.slug === identifier);
        break;
        
      case 'name':
        const tagsByName = await this.ghostService.getTags(identifier);
        tag = tagsByName[0];
        break;
        
      default:
        // Assume it's a slug if no type specified
        const tagsBySlug = await this.ghostService.getTags();
        tag = tagsBySlug.find(t => t.slug === identifier || t.id === identifier);
    }
    
    if (!tag) {
      throw new NotFoundError('Tag', identifier);
    }
    
    // Cache the result
    this.cache.set(cacheKey, tag);
    
    return tag;
  }

  async fetchTags(query = {}) {
    const cacheKey = `tags:${JSON.stringify(query)}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for tags query`);
      return cached;
    }
    
    // Fetch from Ghost
    const tags = await this.ghostService.getTags(query.name);
    
    // Apply client-side filtering if needed
    let filteredTags = tags;
    
    if (query.filter) {
      // Simple filtering implementation
      const filters = query.filter.split('+');
      filteredTags = tags.filter(tag => {
        return filters.every(filter => {
          const [field, value] = filter.split(':');
          return tag[field]?.toString().toLowerCase().includes(value.toLowerCase());
        });
      });
    }
    
    // Apply pagination
    const limit = parseInt(query.limit) || 50;
    const page = parseInt(query.page) || 1;
    const start = (page - 1) * limit;
    const paginatedTags = filteredTags.slice(start, start + limit);
    
    const response = {
      data: paginatedTags,
      meta: {
        pagination: {
          page,
          limit,
          pages: Math.ceil(filteredTags.length / limit),
          total: filteredTags.length
        }
      }
    };
    
    // Cache with shorter TTL for collections
    this.cache.set(cacheKey, response, 60000);
    
    return response;
  }
}

/**
 * Resource Subscription Manager
 */
class ResourceSubscriptionManager extends EventEmitter {
  constructor() {
    super();
    this.subscriptions = new Map();
    this.pollingIntervals = new Map();
  }

  subscribe(uri, callback, options = {}) {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const pollingInterval = options.pollingInterval || 30000; // 30 seconds default
    
    const subscription = {
      id: subscriptionId,
      uri,
      callback,
      lastValue: null,
      options
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    // Start polling if requested
    if (options.enablePolling) {
      this.startPolling(subscriptionId, pollingInterval);
    }
    
    console.log(`Created subscription ${subscriptionId} for ${uri}`);
    
    return subscriptionId;
  }

  unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      throw new NotFoundError('Subscription', subscriptionId);
    }
    
    // Stop polling if active
    this.stopPolling(subscriptionId);
    
    // Remove subscription
    this.subscriptions.delete(subscriptionId);
    
    console.log(`Removed subscription ${subscriptionId}`);
  }

  startPolling(subscriptionId, interval) {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) return;
    
    const pollFunc = async () => {
      try {
        const currentValue = await this.fetchResource(subscription.uri);
        
        // Check if value changed
        if (JSON.stringify(currentValue) !== JSON.stringify(subscription.lastValue)) {
          subscription.lastValue = currentValue;
          subscription.callback({
            type: 'update',
            uri: subscription.uri,
            data: currentValue,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        subscription.callback({
          type: 'error',
          uri: subscription.uri,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
    
    // Initial fetch
    pollFunc();
    
    // Set up interval
    const intervalId = setInterval(pollFunc, interval);
    this.pollingIntervals.set(subscriptionId, intervalId);
  }

  stopPolling(subscriptionId) {
    const intervalId = this.pollingIntervals.get(subscriptionId);
    
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(subscriptionId);
    }
  }

  async fetchResource(uri) {
    // TODO: Implement actual resource fetching logic here.
    // This is a placeholder implementation and should be replaced before production use.
    // The actual implementation should call the parent ResourceManager's fetchResource method
    // or be passed a reference to the resource fetcher during construction.
    return { uri, timestamp: new Date().toISOString() };
  }

  notifySubscribers(uri, data, eventType = 'update') {
    for (const [, subscription] of this.subscriptions) {
      if (this.matchesSubscription(subscription.uri, uri)) {
        subscription.callback({
          type: eventType,
          uri,
          data,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  matchesSubscription(subscriptionURI, eventURI) {
    // Simple matching - could be enhanced with wildcards
    return subscriptionURI === eventURI || 
           subscriptionURI.startsWith(eventURI) ||
           eventURI.startsWith(subscriptionURI);
  }
}

/**
 * Main Resource Manager
 */
export class ResourceManager {
  constructor(ghostService) {
    this.ghostService = ghostService;
    this.cache = new LRUCache(100, 300000); // 100 items, 5 min TTL
    this.fetcher = new ResourceFetcher(ghostService, this.cache);
    this.subscriptionManager = new ResourceSubscriptionManager();
    this.resources = new Map();
  }

  /**
   * Register a resource with enhanced fetching
   */
  registerResource(name, schema, options = {}) {
    const resource = new Resource({
      name,
      description: options.description,
      schema,
      fetch: async (uri) => this.fetchResource(uri)
    });
    
    this.resources.set(name, {
      resource,
      options
    });
    
    return resource;
  }

  /**
   * Main resource fetching method
   */
  async fetchResource(uri) {
    try {
      const parsed = ResourceURIParser.parse(uri);
      
      console.log(`Fetching resource: ${uri}`, parsed);
      
      // Route to appropriate fetcher
      switch (parsed.resourceType) {
        case 'post':
        case 'posts':
          return await this.fetcher.fetchPost(parsed);
          
        case 'tag':
        case 'tags':
          return await this.fetcher.fetchTag(parsed);
          
        default:
          throw new ValidationError(`Unknown resource type: ${parsed.resourceType}`);
      }
    } catch (error) {
      console.error(`Error fetching resource ${uri}:`, error);
      throw error;
    }
  }

  /**
   * List all available resources
   */
  listResources(filter = {}) {
    const resources = [];
    
    for (const [name, { resource, options }] of this.resources) {
      // Apply filter if provided
      if (filter.namespace && !name.startsWith(filter.namespace)) {
        continue;
      }
      
      resources.push({
        uri: name,
        name: resource.name,
        description: resource.description,
        ...options
      });
    }
    
    return resources;
  }

  /**
   * Subscribe to resource changes
   */
  subscribe(uri, callback, options = {}) {
    return this.subscriptionManager.subscribe(uri, callback, options);
  }

  /**
   * Unsubscribe from resource changes
   */
  unsubscribe(subscriptionId) {
    return this.subscriptionManager.unsubscribe(subscriptionId);
  }

  /**
   * Invalidate cache
   */
  invalidateCache(pattern = null) {
    this.cache.invalidate(pattern);
    console.log(`Cache invalidated${pattern ? ` for pattern: ${pattern}` : ''}`);
  }

  /**
   * Notify about resource changes (for webhooks)
   */
  notifyChange(uri, data, eventType = 'update') {
    // Invalidate cache for this resource
    this.cache.invalidate(uri);
    
    // Notify subscribers
    this.subscriptionManager.notifySubscribers(uri, data, eventType);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Batch fetch multiple resources
   */
  async batchFetch(uris) {
    const results = {};
    const errors = {};
    
    await Promise.all(
      uris.map(async (uri) => {
        try {
          results[uri] = await this.fetchResource(uri);
        } catch (error) {
          errors[uri] = {
            message: error.message,
            code: error.code
          };
        }
      })
    );
    
    return { results, errors };
  }

  /**
   * Prefetch resources for warming cache
   */
  async prefetch(patterns) {
    const prefetched = [];
    
    for (const pattern of patterns) {
      try {
        const result = await this.fetchResource(pattern);
        prefetched.push({ pattern, status: 'success' });
      } catch (error) {
        prefetched.push({ 
          pattern, 
          status: 'error',
          error: error.message
        });
      }
    }
    
    return prefetched;
  }
}

export default ResourceManager;