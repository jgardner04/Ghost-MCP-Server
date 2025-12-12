# Schema Validation Architecture

This document describes the Zod-based validation system used in the Ghost MCP Server.

## Overview

The Ghost MCP Server uses [Zod](https://zod.dev/) as its primary validation library. All MCP tool inputs are validated through Zod schemas before processing, providing:

- **Type Safety**: Runtime type checking for all inputs
- **Security**: Built-in HTML sanitization for XSS prevention
- **Clear Errors**: Detailed validation error messages
- **Consistency**: Unified validation across all tools

## File Organization

```
src/schemas/
├── index.js           # Centralized exports
├── common.js          # Shared validators (IDs, emails, URLs, HTML)
├── postSchemas.js     # Post creation, update, query schemas
├── pageSchemas.js     # Page schemas
├── tagSchemas.js      # Tag schemas
├── memberSchemas.js   # Member schemas
├── newsletterSchemas.js # Newsletter schemas
└── tierSchemas.js     # Tier/membership schemas
```

## Common Validators (`common.js`)

### Basic Type Validators

```javascript
import { emailSchema, urlSchema, ghostIdSchema, slugSchema } from './schemas/index.js';

// Email validation
emailSchema.parse('user@example.com'); // ✓
emailSchema.parse('invalid-email'); // ✗ "Invalid email format"

// Ghost ID validation (24-character hex)
ghostIdSchema.parse('507f1f77bcf86cd799439011'); // ✓
ghostIdSchema.parse('invalid'); // ✗ "Invalid Ghost ID format"

// URL validation
urlSchema.parse('https://example.com'); // ✓
urlSchema.parse('not-a-url'); // ✗ "Invalid URL format"

// Slug validation
slugSchema.parse('my-post-slug'); // ✓
slugSchema.parse('Invalid Slug'); // ✗ Must be lowercase with hyphens
```

### Security Validators

#### NQL Filter Validation

Prevents injection attacks in Ghost Query Language filters:

```javascript
import { nqlFilterSchema } from './schemas/index.js';

// Safe patterns
nqlFilterSchema.parse('status:published'); // ✓
nqlFilterSchema.parse('tag:javascript+status:draft'); // ✓

// Dangerous patterns are rejected
nqlFilterSchema.parse('tag:<script>'); // ✗ Disallowed characters
```

### Pagination Validators

```javascript
import { limitSchema, pageSchema, paginationSchema } from './schemas/index.js';

// Limit validation (1-100, default: 15)
limitSchema.parse(50); // ✓
limitSchema.parse(200); // ✗ "Limit cannot exceed 100"

// Page validation (1+, default: 1)
pageSchema.parse(1); // ✓
pageSchema.parse(0); // ✗ "Page must be at least 1"
```

## HTML Sanitization

The most critical security feature is automatic HTML sanitization integrated into content schemas.

### How It Works

```javascript
import { htmlContentSchema } from './schemas/index.js';

// Input with potentially dangerous content
const userInput = '<p>Hello</p><script>alert("xss")</script>';

// Sanitization happens automatically during validation
const sanitized = htmlContentSchema.parse(userInput);
// Result: '<p>Hello</p>' (script tag removed)
```

### Allowed HTML Tags

The following tags are permitted:

- Headers: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- Content: `p`, `blockquote`, `pre`, `code`, `hr`, `br`
- Lists: `ul`, `ol`, `li`
- Formatting: `b`, `i`, `strong`, `em`, `strike`, `span`
- Structure: `div`, `figure`, `figcaption`
- Links & Images: `a`, `img`

### Allowed Attributes

```javascript
{
  a: ['href', 'name', 'target', 'rel', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  '*': ['class', 'id']  // All elements can have class/id
}
```

### Allowed URL Schemes

Only safe protocols are allowed in `href` and `src` attributes:

- `http:`
- `https:`
- `mailto:`

## Per-Resource Schemas

### Post Schemas (`postSchemas.js`)

```javascript
import { createPostSchema, updatePostSchema, postQuerySchema } from './schemas/index.js';

// Create post validation
const postData = createPostSchema.parse({
  title: 'My Post',
  html: '<p>Content here</p>',
  status: 'draft',
  tags: ['javascript', 'tutorial'],
});

// Update post validation (all fields optional except id)
const updateData = updatePostSchema.parse({
  title: 'Updated Title',
});

// Query validation
const queryData = postQuerySchema.parse({
  status: 'published',
  limit: 10,
  page: 1,
});
```

### Tag Schemas (`tagSchemas.js`)

```javascript
import { createTagSchema, updateTagSchema, tagQuerySchema } from './schemas/index.js';

// Create tag
const tagData = createTagSchema.parse({
  name: 'JavaScript',
  description: 'Posts about JS',
  slug: 'javascript', // Optional, auto-generated if omitted
});
```

### Member Schemas (`memberSchemas.js`)

```javascript
import { createMemberSchema, updateMemberSchema, memberQuerySchema } from './schemas/index.js';

// Create member
const memberData = createMemberSchema.parse({
  email: 'user@example.com',
  name: 'John Doe',
  labels: ['Premium'],
  newsletters: ['newsletter-id-here'],
});
```

## Using Schemas in MCP Tools

The `validateToolInput` utility standardizes schema validation in tool handlers:

```javascript
import { validateToolInput } from './utils/validation.js';
import { createPostSchema } from './schemas/index.js';

server.tool('ghost_create_post', 'Creates a post', createPostSchema, async (rawInput) => {
  // Validate input
  const validation = validateToolInput(createPostSchema, rawInput, 'ghost_create_post');

  if (!validation.success) {
    return validation.errorResponse; // Returns formatted error
  }

  // Use validated data
  const input = validation.data;
  // input.html is already sanitized
  // input.title is validated
  // etc.
});
```

## Error Handling

### Validation Error Response

When validation fails, a structured error is returned:

```javascript
{
  content: [{
    type: 'text',
    text: JSON.stringify({
      error: 'ValidationError',
      message: 'Invalid input for ghost_create_post',
      details: [
        { field: 'title', message: 'Title cannot be empty' },
        { field: 'html', message: 'HTML content cannot be empty' }
      ]
    }, null, 2)
  }],
  isError: true
}
```

### Converting Zod Errors

The `ValidationError.fromZod()` method converts Zod errors to a consistent format:

```javascript
import { ValidationError } from './errors/index.js';

try {
  createPostSchema.parse(invalidData);
} catch (error) {
  if (error.name === 'ZodError') {
    const validationError = ValidationError.fromZod(error, 'Post creation');
    // Returns structured ValidationError with all field errors
  }
}
```

## Adding New Schemas

When adding new resource types or tools:

1. **Create a schema file** in `src/schemas/`:

```javascript
// src/schemas/newResourceSchemas.js
import { z } from 'zod';
import { ghostIdSchema, titleSchema } from './common.js';

export const createNewResourceSchema = z.object({
  name: titleSchema,
  // ... other fields
});

export const updateNewResourceSchema = createNewResourceSchema.partial();
```

2. **Export from index.js**:

```javascript
// src/schemas/index.js
export * from './newResourceSchemas.js';
```

3. **Use in MCP tool**:

```javascript
import { createNewResourceSchema } from './schemas/index.js';
import { validateToolInput } from './utils/validation.js';

server.tool('ghost_create_resource', 'Description', createNewResourceSchema, async (rawInput) => {
  const validation = validateToolInput(createNewResourceSchema, rawInput, 'ghost_create_resource');
  // ...
});
```

## Best Practices

1. **Always use `validateToolInput`** for consistent error handling
2. **Leverage HTML sanitization** - use `htmlContentSchema` for user-provided HTML
3. **Use `ghostIdSchema`** for all Ghost resource IDs
4. **Apply `nqlFilterSchema`** for filter parameters to prevent injection
5. **Set sensible defaults** using Zod's `.default()` method
6. **Use `.optional()`** for non-required fields
7. **Provide clear error messages** in schema definitions

## Related Documentation

- [Tools Reference](./TOOLS_REFERENCE.md) - Complete tool documentation
- [Error Handling](./ERROR_HANDLING.md) - Error types and patterns
