# Enhanced Resource Fetching System

> **Note:** This document describes the enhanced MCP server (`src/mcp_server_enhanced.js`), which provides MCP resource support with caching, subscriptions, and batch operations. The main server (`src/mcp_server.js`) used by default npm scripts provides tools only.

## Overview

The enhanced resource fetching system provides advanced capabilities for accessing Ghost CMS resources through the MCP protocol with intelligent caching, flexible URI patterns, and real-time subscriptions.

## Key Improvements

### 1. **Flexible URI Patterns**

Support for multiple resource identifier types and query patterns:

```javascript
// Individual resources by ID
ghost/post/123
ghost/tag/456

// Resources by slug
ghost/post/slug:my-awesome-post
ghost/tag/slug:web-development

// Resources by UUID
ghost/post/uuid:550e8400-e29b-41d4-a716-446655440000

// Resources by name
ghost/tag/name:JavaScript

// Collections with query parameters
ghost/posts?status=published&limit=10&page=2
ghost/tags?filter=name:tech&limit=20
```

### 2. **Intelligent Caching**

LRU cache with TTL and pattern-based invalidation:

```javascript
// Cache configuration
const cache = new LRUCache(100, 300000); // 100 items, 5 min TTL

// Different TTL for collections vs individuals
individual: 5 minutes
collections: 1 minute

// Pattern-based invalidation
cache.invalidate('post:*');     // All posts
cache.invalidate('tag:slug:*'); // All tags by slug
```

### 3. **Real-time Subscriptions**

Subscribe to resource changes with automatic updates:

```javascript
// Subscribe to a specific post
const subscriptionId = resourceManager.subscribe(
  'ghost/post/123',
  (event) => {
    console.log('Post updated:', event.data);
  },
  { enablePolling: true, pollingInterval: 30000 }
);

// Subscribe to all posts
resourceManager.subscribe('ghost/posts', callback);
```

### 4. **Batch Operations**

Fetch multiple resources efficiently:

```javascript
// Batch fetch
const result = await resourceManager.batchFetch([
  'ghost/post/123',
  'ghost/tag/456',
  'ghost/posts?status=published&limit=5',
]);

// Results and errors separated
console.log(result.results); // Successful fetches
console.log(result.errors); // Failed fetches
```

## Resource URI Patterns

### Posts

| Pattern                  | Description    | Example                                 |
| ------------------------ | -------------- | --------------------------------------- |
| `ghost/post/{id}`        | Post by ID     | `ghost/post/123`                        |
| `ghost/post/slug:{slug}` | Post by slug   | `ghost/post/slug:my-post`               |
| `ghost/post/uuid:{uuid}` | Post by UUID   | `ghost/post/uuid:550e8400-...`          |
| `ghost/posts`            | All posts      | `ghost/posts`                           |
| `ghost/posts?{query}`    | Filtered posts | `ghost/posts?status=published&limit=10` |

### Tags

| Pattern                 | Description   | Example                     |
| ----------------------- | ------------- | --------------------------- |
| `ghost/tag/{id}`        | Tag by ID     | `ghost/tag/456`             |
| `ghost/tag/slug:{slug}` | Tag by slug   | `ghost/tag/slug:technology` |
| `ghost/tag/name:{name}` | Tag by name   | `ghost/tag/name:JavaScript` |
| `ghost/tags`            | All tags      | `ghost/tags`                |
| `ghost/tags?{query}`    | Filtered tags | `ghost/tags?limit=20`       |

## Query Parameters

### Posts Collection

```javascript
ghost/posts?status=published&limit=10&page=2&include=tags,authors&order=published_at%20desc
```

| Parameter | Type    | Description                                          | Default             |
| --------- | ------- | ---------------------------------------------------- | ------------------- |
| `status`  | string  | Filter by status (`draft`, `published`, `scheduled`) | all                 |
| `limit`   | integer | Number of posts per page (1-100)                     | 15                  |
| `page`    | integer | Page number (1+)                                     | 1                   |
| `include` | string  | Related data to include (`tags`, `authors`)          | `tags,authors`      |
| `order`   | string  | Sort order                                           | `published_at desc` |
| `filter`  | string  | Advanced Ghost filter syntax                         | none                |

### Tags Collection

```javascript
ghost/tags?limit=20&filter=name:tech
```

| Parameter | Type    | Description                     | Default |
| --------- | ------- | ------------------------------- | ------- |
| `limit`   | integer | Number of tags per page (1-100) | 50      |
| `page`    | integer | Page number (1+)                | 1       |
| `filter`  | string  | Filter tags                     | none    |
| `name`    | string  | Filter by exact name            | none    |

## Advanced Usage

### 1. Prefetching for Performance

```javascript
// Warm the cache with commonly accessed resources
await resourceManager.prefetch([
  'ghost/posts?status=published&limit=10',
  'ghost/tags?limit=20',
  'ghost/post/slug:homepage',
]);
```

### 2. Cache Management

```javascript
// Check cache statistics
const stats = resourceManager.getCacheStats();
console.log(`Cache: ${stats.size}/${stats.maxSize} items`);

// Invalidate specific patterns
resourceManager.invalidateCache('post:*'); // All posts
resourceManager.invalidateCache('tag:slug:tech'); // Specific tag

// Clear entire cache
resourceManager.invalidateCache();
```

### 3. Resource Subscriptions

```javascript
// Subscribe with options
const subscriptionId = resourceManager.subscribe(
  'ghost/post/123',
  (event) => {
    switch (event.type) {
      case 'update':
        console.log('Resource updated:', event.data);
        break;
      case 'error':
        console.error('Subscription error:', event.error);
        break;
    }
  },
  {
    enablePolling: true,
    pollingInterval: 30000, // 30 seconds
  }
);

// Unsubscribe when done
resourceManager.unsubscribe(subscriptionId);
```

### 4. Batch Operations with Error Handling

```javascript
const operations = [
  { id: 'op1', type: 'create_post', data: { title: 'New Post', html: '...' } },
  { id: 'op2', type: 'create_tag', data: { name: 'Technology' } },
  { id: 'op3', type: 'fetch_resource', data: { uri: 'ghost/post/123' } },
];

const result = await mcpServer.tools.ghost_batch_operations.execute({
  operations,
  stopOnError: false,
});

// Process results
for (const [id, result] of Object.entries(result.results)) {
  if (result.success) {
    console.log(`Operation ${id} succeeded:`, result.data);
  } else {
    console.error(`Operation ${id} failed:`, result.error);
  }
}
```

## HTTP Endpoints

The enhanced server provides HTTP endpoints for direct resource access:

### Resource Listing

```http
GET /resources
GET /resources?namespace=ghost
```

### Individual Resource Fetching

```http
GET /resources/ghost/post/123
GET /resources/ghost/tag/slug:technology
GET /resources/ghost/posts?status=published&limit=10
```

### Batch Operations

```http
POST /batch
Content-Type: application/json

{
  "uris": [
    "ghost/post/123",
    "ghost/tag/456",
    "ghost/posts?limit=5"
  ]
}
```

### Cache Management

```http
GET /cache/stats
POST /cache/invalidate
POST /cache/prefetch
```

## WebSocket Real-time Updates

For real-time applications, use WebSocket transport with subscriptions:

```javascript
// Client-side WebSocket connection
const ws = new WebSocket('ws://localhost:3001');

// Subscribe to resources
ws.send(
  JSON.stringify({
    type: 'subscribe',
    uri: 'ghost/post/123',
    options: { enablePolling: true, pollingInterval: 30000 },
  })
);

// Listen for updates
ws.on('message', (data) => {
  const message = JSON.parse(data);

  if (message.type === 'subscription_update') {
    console.log('Resource updated:', message.data);
  }
});
```

## Performance Optimizations

### 1. **Cache Hit Ratio**

Monitor cache performance:

```javascript
const stats = resourceManager.getCacheStats();
console.log(`Cache hit ratio: ${stats.hits}/${stats.requests}`);
```

### 2. **Batch Requests**

Reduce API calls by batching:

```javascript
// Instead of multiple individual requests
const post1 = await fetch('ghost/post/123');
const post2 = await fetch('ghost/post/456');
const tags = await fetch('ghost/tags');

// Use batch fetching
const results = await resourceManager.batchFetch([
  'ghost/post/123',
  'ghost/post/456',
  'ghost/tags',
]);
```

### 3. **Selective Loading**

Only fetch required fields:

```javascript
// Include only necessary related data
ghost/posts?include=tags&limit=10

// Use lightweight tag endpoint instead of full data
ghost/tags?limit=all  // Just names and IDs
```

## Error Handling

### Resource Not Found

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Post not found: 123",
    "statusCode": 404
  }
}
```

### Invalid URI Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid resource URI format",
    "statusCode": 400
  }
}
```

### Cache Errors

```json
{
  "error": {
    "code": "CACHE_ERROR",
    "message": "Cache operation failed",
    "statusCode": 500
  }
}
```

## Configuration

Environment variables for resource management:

```env
# Cache settings
RESOURCE_CACHE_SIZE=100           # Max cached items
RESOURCE_CACHE_TTL=300000         # TTL in milliseconds (5 min)
COLLECTION_CACHE_TTL=60000        # Collection TTL (1 min)

# Subscription settings
SUBSCRIPTION_POLLING_INTERVAL=30000  # Default polling interval
MAX_SUBSCRIPTIONS_PER_CLIENT=10      # Limit subscriptions

# Performance settings
BATCH_MAX_OPERATIONS=10           # Max operations per batch
PREFETCH_PARALLEL_LIMIT=5         # Parallel prefetch requests
```

## Migration from Basic Implementation

### 1. Update Resource Access

```javascript
// Before: Simple resource access
const tag = await getGhostTags().find((t) => t.id === tagId);

// After: Enhanced resource fetching
const tag = await resourceManager.fetchResource(`ghost/tag/${tagId}`);
```

### 2. Use Batch Operations

```javascript
// Before: Sequential operations
const post = await createPost(postData);
const tag = await createTag(tagData);

// After: Batch operations
const result = await batchOperationsTool.execute({
  operations: [
    { id: 'post', type: 'create_post', data: postData },
    { id: 'tag', type: 'create_tag', data: tagData },
  ],
});
```

### 3. Add Caching

```javascript
// Before: Direct API calls
const posts = await ghostAPI.posts.browse({ limit: 10 });

// After: Cached resource access
const posts = await resourceManager.fetchResource('ghost/posts?limit=10');
```

## Testing

### Unit Tests

```javascript
describe('ResourceManager', () => {
  it('should cache fetched resources', async () => {
    const result1 = await resourceManager.fetchResource('ghost/post/123');
    const result2 = await resourceManager.fetchResource('ghost/post/123');

    expect(ghostService.getPost).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
  });

  it('should invalidate cache on pattern match', async () => {
    await resourceManager.fetchResource('ghost/post/123');
    resourceManager.invalidateCache('post:*');

    const stats = resourceManager.getCacheStats();
    expect(stats.size).toBe(0);
  });
});
```

### Integration Tests

```javascript
describe('Resource Endpoints', () => {
  it('should fetch post by slug', async () => {
    const response = await request(app).get('/resources/ghost/post/slug:my-post');

    expect(response.status).toBe(200);
    expect(response.body.slug).toBe('my-post');
  });

  it('should return paginated posts', async () => {
    const response = await request(app).get('/resources/ghost/posts?limit=5&page=2');

    expect(response.status).toBe(200);
    expect(response.body.meta.pagination.page).toBe(2);
    expect(response.body.data.length).toBeLessThanOrEqual(5);
  });
});
```

## Best Practices

1. **Use caching effectively** - Let the system cache frequently accessed resources
2. **Batch operations** when possible to reduce API calls
3. **Use specific identifiers** (slug, UUID) when available for better cache efficiency
4. **Subscribe selectively** - Only subscribe to resources you actually need to monitor
5. **Monitor cache performance** - Track hit ratios and adjust cache size as needed
6. **Handle errors gracefully** - Always check for errors in batch operations
7. **Use appropriate TTL** - Shorter TTL for frequently changing data
8. **Prefetch strategically** - Warm cache with commonly accessed resources

The enhanced resource fetching system provides a robust, performant, and flexible foundation for accessing Ghost CMS resources through the MCP protocol.
