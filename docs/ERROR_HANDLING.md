# Error Handling Best Practices Implementation

## Overview

The improved error handling system provides comprehensive error management following industry best practices:

- **Structured error types** with inheritance hierarchy
- **Automatic retry logic** with exponential backoff
- **Circuit breaker pattern** for external services
- **Detailed error logging** and metrics collection
- **Graceful error recovery** and shutdown
- **Security-conscious error responses**

## Error Types Hierarchy

```
BaseError (500)
├── ValidationError (400)
├── AuthenticationError (401)
├── AuthorizationError (403)
├── NotFoundError (404)
├── ConflictError (409)
├── RateLimitError (429)
├── ExternalServiceError (502)
│   └── GhostAPIError
├── MCPProtocolError (400)
├── ToolExecutionError (500)
├── ImageProcessingError (422)
└── ConfigurationError (500)
```

## Key Features

### 1. Structured Error Classes

All errors extend `BaseError` with consistent properties:

```javascript
{
  name: "ValidationError",
  message: "Post title is required",
  code: "VALIDATION_ERROR",
  statusCode: 400,
  isOperational: true,
  timestamp: "2024-01-15T10:30:00.000Z",
  errors: [/* field-specific errors */]
}
```

### 2. Circuit Breaker Pattern

Prevents cascading failures when Ghost API is unavailable:

```javascript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  resetTimeout: 60000,       // Try again after 1 minute
  monitoringPeriod: 10000    // Monitor over 10 seconds
});
```

States:
- **CLOSED**: Normal operation
- **OPEN**: Service unavailable, fast-fail all requests
- **HALF_OPEN**: Testing if service recovered

### 3. Retry Mechanism

Automatic retry with exponential backoff for transient failures:

```javascript
await retryWithBackoff(operation, {
  maxAttempts: 3,
  onRetry: (attempt, error) => {
    console.log(`Retry ${attempt}/3`);
  }
});
```

Retry delays: 1s → 2s → 4s (with jitter)

### 4. Error Logging

Comprehensive logging to files and console:

```
logs/
├── error-2024-01-15.log    # Error logs
├── app-2024-01-15.log      # Application logs
└── debug-2024-01-15.log    # Debug logs
```

Features:
- Automatic log rotation at 10MB
- Structured JSON logging
- Different log levels (debug, info, warning, error, fatal)
- Context preservation (request details, user info)

### 5. Error Metrics

Real-time error tracking:

```javascript
{
  totalErrors: 42,
  errorsByType: {
    "ValidationError": 15,
    "GhostAPIError": 10,
    "NotFoundError": 17
  },
  errorsByStatusCode: {
    "400": 15,
    "404": 17,
    "502": 10
  },
  errorsByEndpoint: {
    "POST /api/posts": 8,
    "GET /api/tags": 5
  }
}
```

## Usage Examples

### Basic Error Handling

```javascript
import { ValidationError, NotFoundError } from './errors/index.js';

// Throwing validation errors
if (!postData.title) {
  throw new ValidationError('Post title is required', [
    { field: 'title', message: 'Required field' }
  ]);
}

// Throwing not found errors
const post = await getPost(postId);
if (!post) {
  throw new NotFoundError('Post', postId);
}
```

### Service Layer with Retry

```javascript
import { retryWithBackoff, ErrorHandler } from './errors/index.js';

async function createPostWithRetry(data) {
  return await retryWithBackoff(
    () => ghostService.createPost(data),
    { maxAttempts: 3 }
  );
}
```

### Express Route with Error Handling

```javascript
import { asyncHandler, validateRequest } from './middleware/errorMiddleware.js';
import { postSchema } from './schemas/post.js';

router.post('/posts',
  validateRequest(postSchema),
  asyncHandler(async (req, res) => {
    const post = await createPost(req.body);
    res.status(201).json(post);
  })
);
```

### MCP Tool with Error Handling

```javascript
const tool = new Tool({
  name: 'create_post',
  implementation: async (input) => {
    try {
      return await createPost(input);
    } catch (error) {
      return ErrorHandler.formatMCPError(error, 'create_post');
    }
  }
});
```

## Configuration

### Environment Variables

```env
# Logging
LOG_LEVEL=info              # debug, info, warning, error
LOG_DIR=./logs              # Log directory path
MAX_LOG_SIZE=10485760       # Max log file size (10MB)

# Error handling
MAX_RETRIES=3               # Maximum retry attempts
RETRY_DELAY=1000           # Base retry delay (ms)
CIRCUIT_BREAKER_THRESHOLD=5 # Failures before opening
CIRCUIT_BREAKER_TIMEOUT=60000 # Reset timeout (ms)

# Rate limiting
RATE_LIMIT_WINDOW=60000    # Time window (ms)
RATE_LIMIT_MAX_REQUESTS=100 # Max requests per window
```

### Middleware Setup

```javascript
import {
  expressErrorHandler,
  RateLimiter,
  apiKeyAuth,
  GracefulShutdown,
  healthCheck
} from './middleware/errorMiddleware.js';

const app = express();
const rateLimiter = new RateLimiter();
const gracefulShutdown = new GracefulShutdown();

// Apply middleware
app.use(gracefulShutdown.middleware());
app.use(rateLimiter.middleware());
app.use('/api', apiKeyAuth(process.env.API_KEY));

// Health check
app.get('/health', healthCheck(ghostService));

// Error handler (must be last)
app.use(expressErrorHandler);

// Graceful shutdown
process.on('SIGTERM', () => gracefulShutdown.shutdown(server));
```

## Security Considerations

### 1. Error Response Sanitization

Production responses hide sensitive information:

```javascript
// Development
{
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Connection failed to ghost_db:5432",
    "stack": "Error: Connection failed..."
  }
}

// Production
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred"
  }
}
```

### 2. Input Validation

Comprehensive validation before processing:

```javascript
validators.validatePostData(data);  // Throws ValidationError
validators.validateTagData(data);   // Throws ValidationError
validators.validateImagePath(path); // Throws ValidationError or NotFoundError
```

### 3. XSS Prevention

Basic HTML sanitization for post content:

```javascript
// Removes script tags and event handlers
dataWithDefaults.html = sanitizeHTML(dataWithDefaults.html);
```

### 4. Rate Limiting

Prevents abuse and DOS attacks:

```javascript
const rateLimiter = new RateLimiter({
  windowMs: 60000,      // 1 minute
  maxRequests: 100      // 100 requests per minute
});
```

## Monitoring and Alerting

### Health Check Endpoint

```bash
GET /health

{
  "status": "healthy",
  "site": {
    "title": "My Ghost Blog",
    "version": "5.0.0"
  },
  "circuitBreaker": {
    "state": "CLOSED",
    "failureCount": 0
  },
  "metrics": {
    "errors": 42,
    "uptime": 3600,
    "memory": { /* usage stats */ }
  }
}
```

### Error Metrics Endpoint

```bash
GET /metrics

{
  "totalErrors": 42,
  "errorsByType": { /* ... */ },
  "errorsByStatusCode": { /* ... */ },
  "errorsByEndpoint": { /* ... */ },
  "uptime": 3600,
  "memoryUsage": { /* ... */ }
}
```

## Migration Guide

### From Basic Error Handling

1. **Replace generic errors with typed errors:**
```javascript
// Before
throw new Error('Post not found');

// After
throw new NotFoundError('Post', postId);
```

2. **Add retry logic to external calls:**
```javascript
// Before
const result = await ghostAPI.posts.add(data);

// After
const result = await retryWithBackoff(
  () => ghostAPI.posts.add(data)
);
```

3. **Use error middleware in Express:**
```javascript
// Before
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

// After
import { expressErrorHandler } from './middleware/errorMiddleware.js';
app.use(expressErrorHandler);
```

4. **Wrap async routes:**
```javascript
// Before
router.get('/posts/:id', async (req, res) => { /* ... */ });

// After
router.get('/posts/:id', asyncHandler(async (req, res) => { /* ... */ }));
```

## Testing Error Handling

### Unit Tests

```javascript
describe('Error Handling', () => {
  it('should retry on transient failures', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true });
    
    const result = await retryWithBackoff(operation);
    
    expect(operation).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  });
  
  it('should open circuit breaker after threshold', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    
    await expect(breaker.execute(failingOperation)).rejects.toThrow();
    await expect(breaker.execute(failingOperation)).rejects.toThrow();
    
    expect(breaker.state).toBe('OPEN');
  });
});
```

### Integration Tests

```javascript
describe('API Error Responses', () => {
  it('should return 400 for validation errors', async () => {
    const response = await request(app)
      .post('/api/posts')
      .send({ /* invalid data */ });
    
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
  
  it('should return 429 for rate limit', async () => {
    // Make many requests quickly
    for (let i = 0; i < 101; i++) {
      await request(app).get('/api/posts');
    }
    
    const response = await request(app).get('/api/posts');
    expect(response.status).toBe(429);
  });
});
```

## Best Practices Summary

1. **Always use typed errors** instead of generic Error class
2. **Implement retry logic** for external service calls
3. **Use circuit breakers** to prevent cascading failures
4. **Log errors with context** for debugging
5. **Sanitize error responses** in production
6. **Validate all inputs** before processing
7. **Monitor error metrics** for early problem detection
8. **Implement graceful shutdown** for zero-downtime deployments
9. **Use rate limiting** to prevent abuse
10. **Test error paths** as thoroughly as success paths