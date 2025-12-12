# Service Layer Patterns

This document describes the service import patterns used in the Ghost MCP Server. Following these patterns ensures consistent, maintainable code and avoids common issues.

## Overview

The MCP server uses **lazy loading** for service imports to avoid Node.js ESM module loading issues (specifically Buffer compatibility in Node.js v25+). All services are loaded once through a centralized `loadServices()` function and accessed via module-level variables.

## Why Lazy Loading?

```javascript
// This pattern exists because direct top-level imports can cause issues:
// import { getTags } from './services/ghostServiceImproved.js';  // Can fail at startup

// Instead, we defer loading until first use:
const loadServices = async () => {
  if (!ghostService) {
    ghostService = await import('./services/ghostServiceImproved.js');
    // ... other services
  }
};
```

**Benefits:**
- Avoids Node.js v25 Buffer compatibility issues at startup
- Services are loaded once and cached
- Consistent access pattern across all tool handlers
- Easier to mock in tests

## Required Pattern

### Service Variables (Top of File)

```javascript
// Lazy-loaded modules (to avoid Node.js v25 Buffer compatibility issues at startup)
let ghostService = null;
let postService = null;
let pageService = null;
let newsletterService = null;
let imageProcessingService = null;
let urlValidator = null;
```

### loadServices() Function

```javascript
const loadServices = async () => {
  if (!ghostService) {
    ghostService = await import('./services/ghostServiceImproved.js');
    postService = await import('./services/postService.js');
    pageService = await import('./services/pageService.js');
    newsletterService = await import('./services/newsletterService.js');
    imageProcessingService = await import('./services/imageProcessingService.js');
    urlValidator = await import('./utils/urlValidator.js');
  }
};
```

### Using Services in Tool Handlers

```javascript
// CORRECT: Use lazy-loaded variables
server.tool('ghost_get_tags', '...', schema, async (rawInput) => {
  // ... validation ...
  try {
    await loadServices();  // Ensure services are loaded
    const tags = await ghostService.getTags();  // Use the variable
    // ...
  } catch (error) {
    // ...
  }
});
```

## Anti-Patterns (Don't Do This)

### Inline Dynamic Imports

```javascript
// WRONG: Don't import inline in each handler
server.tool('ghost_get_tags', '...', schema, async (rawInput) => {
  try {
    await loadServices();
    // DON'T DO THIS - creates redundant imports
    const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
    const tags = await ghostServiceImproved.getTags();
  }
});
```

**Problems with inline imports:**
- Redundant code (same import repeated 30+ times)
- Inconsistent naming (`ghostServiceImproved` vs `ghostService`)
- Harder to maintain and refactor
- Confusing for new contributors

### Mixed Patterns

```javascript
// WRONG: Don't mix lazy-loaded variables with inline imports
const tags = await ghostService.getTags();  // Uses lazy-loaded
const post = await ghostServiceImproved.updatePost(id, data);  // Uses inline import
```

## Adding a New Service

When adding a new service to the MCP server:

1. **Add the variable declaration:**
   ```javascript
   let myNewService = null;
   ```

2. **Add to loadServices():**
   ```javascript
   const loadServices = async () => {
     if (!ghostService) {
       // ... existing services ...
       myNewService = await import('./services/myNewService.js');
     }
   };
   ```

3. **Use in handlers:**
   ```javascript
   await loadServices();
   const result = await myNewService.doSomething();
   ```

4. **Add mocks in tests:**
   ```javascript
   const mockMyNewMethod = vi.fn();

   vi.mock('../services/myNewService.js', () => ({
     doSomething: (...args) => mockMyNewMethod(...args),
   }));
   ```

## Service Architecture

```
src/services/
├── ghostServiceImproved.js  # Primary Ghost API wrapper (enhanced)
├── postService.js           # Post creation logic
├── pageService.js           # Page creation logic
├── newsletterService.js     # Newsletter creation logic
├── memberService.js         # Member validation utilities
├── tierService.js           # Tier validation utilities
└── ghostService.js          # Legacy (used by REST API controllers)
```

**Key distinction:**
- `ghostServiceImproved.js` - Enhanced Ghost API client with circuit breaker, retry logic, and comprehensive validation. **Use this for MCP tools.**
- `ghostService.js` - Basic Ghost API client. **Used by Express REST API controllers only.**

## Testing

When testing MCP tools, mock all services that will be lazy-loaded:

```javascript
// Mock all services used by ghostServiceImproved
vi.mock('../services/ghostServiceImproved.js', () => ({
  getPosts: (...args) => mockGetPosts(...args),
  getPost: (...args) => mockGetPost(...args),
  // ... all other methods
}));

// Mock specialized services
vi.mock('../services/pageService.js', () => ({
  createPageService: (...args) => mockCreatePageService(...args),
}));
```

## ESLint Enforcement

An ESLint rule prevents inline dynamic imports of services:

```javascript
// This will trigger an ESLint error:
const ghostServiceImproved = await import('./services/ghostServiceImproved.js');
// Error: Use lazy-loaded service variables instead of inline dynamic imports
```

## Related Documentation

- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error handling patterns
- [SCHEMA_VALIDATION.md](./SCHEMA_VALIDATION.md) - Input validation with Zod
- [TOOLS_REFERENCE.md](./TOOLS_REFERENCE.md) - Complete MCP tools reference
