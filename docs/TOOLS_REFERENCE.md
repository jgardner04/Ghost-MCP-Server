# MCP Tools Reference

This document provides a comprehensive reference for all 34 MCP tools available in the Ghost MCP Server.

## Breaking Changes

### v1.x - getTags Default Limit Changed (PR #87)

**What Changed:**
- The `ghost_get_tags` tool default `limit` parameter changed from `'all'` (unlimited) to `15`

**Impact:**
- Users with more than 15 tags will now see only the first 15 tags by default
- This may affect existing integrations that expected all tags to be returned

**Migration Guide:**

To get the old behavior (fetch all tags), explicitly set `limit: 'all'`:

```json
{
  "limit": "all"
}
```

For better performance with large tag lists, use pagination instead:

```json
{
  "limit": 50,
  "page": 1
}
```

**Rationale:**
- Aligns with Ghost API best practices
- Prevents performance issues with large tag lists
- Matches the schema-defined default
- Encourages explicit pagination for scalability

---

## Overview

| Resource    | Tools | Description                       |
| ----------- | ----- | --------------------------------- |
| Tags        | 5     | Create, read, update, delete tags |
| Images      | 1     | Upload images to Ghost            |
| Posts       | 6     | Full CRUD + search for posts      |
| Pages       | 6     | Full CRUD + search for pages      |
| Members     | 6     | Full CRUD + search for members    |
| Newsletters | 5     | Full CRUD for newsletters         |
| Tiers       | 5     | Full CRUD for membership tiers    |

## Tool Response Format

All tools return responses in this format:

```json
{
  "content": [{ "type": "text", "text": "JSON result or message" }],
  "isError": false // true if error occurred
}
```

---

## Tag Tools

### ghost_get_tags

Retrieves a list of tags from Ghost CMS with pagination, filtering, and sorting.

**Schema:**

```typescript
{
  name?: string;       // Filter by exact tag name
  limit?: number | 'all';  // Results per page (1-100, default: 15, or 'all' for unlimited)
  page?: number;       // Page number (default: 1)
  order?: string;      // Sort order (e.g., "name ASC", "created_at DESC")
  include?: string;    // Relations to include (e.g., "count.posts")
  filter?: string;     // NQL filter string
}
```

**Examples:**

Basic usage (returns first 15 tags):
```json
{}
```

Filter by tag name:
```json
{ "name": "Technology" }
```

Get all tags (for backward compatibility):
```json
{ "limit": "all" }
```

Pagination for large tag lists:
```json
{
  "limit": 50,
  "page": 2,
  "order": "name ASC"
}
```

Include post count:
```json
{
  "limit": 20,
  "include": "count.posts"
}
```

**Note:** If you have more than 15 tags and need all of them, explicitly set `limit: 'all'` or use pagination. See [Breaking Changes](#breaking-changes) for migration details.

---

### ghost_create_tag

Creates a new tag in Ghost CMS.

**Schema:**

```typescript
{
  name: string;         // Required: Tag name (1-191 chars)
  description?: string; // Tag description
  slug?: string;        // URL slug (auto-generated if omitted)
}
```

**Example:**

```json
{
  "name": "JavaScript",
  "description": "Posts about JavaScript programming"
}
```

---

### ghost_get_tag

Retrieves a single tag by ID or slug.

**Schema:**

```typescript
{
  id?: string;      // Ghost ID (24 hex chars)
  slug?: string;    // Tag slug
  include?: string; // Additional relations (e.g., "count.posts")
}
```

**Note:** Either `id` or `slug` must be provided.

---

### ghost_update_tag

Updates an existing tag.

**Schema:**

```typescript
{
  id: string;           // Required: Ghost ID
  name?: string;        // New tag name
  description?: string; // New description
  slug?: string;        // New slug
}
```

---

### ghost_delete_tag

Deletes a tag permanently.

**Schema:**

```typescript
{
  id: string; // Required: Ghost ID
}
```

---

## Image Tools

### ghost_upload_image

Downloads an image from URL, processes it, and uploads to Ghost.

**Schema:**

```typescript
{
  imageUrl: string;  // Required: Publicly accessible image URL
  alt?: string;      // Alt text (auto-generated if omitted)
}
```

**Response:**

```json
{
  "url": "https://your-ghost.com/content/images/2024/01/image.jpg",
  "alt": "Uploaded image"
}
```

**Security:** URLs are validated for SSRF protection before downloading.

---

## Post Tools

### ghost_create_post

Creates a new post in Ghost CMS.

**Schema:**

```typescript
{
  title: string;              // Required: Post title (1-255 chars)
  html: string;               // Required: HTML content (sanitized)
  status?: 'draft' | 'published' | 'scheduled';  // Default: 'draft'
  tags?: string[];            // Tag names (auto-created if missing)
  published_at?: string;      // ISO datetime (required if scheduled)
  custom_excerpt?: string;    // Post excerpt (max 500 chars)
  feature_image?: string;     // Featured image URL
  feature_image_alt?: string; // Alt text (max 125 chars)
  feature_image_caption?: string;
  meta_title?: string;        // SEO title (max 300 chars)
  meta_description?: string;  // SEO description (max 500 chars)
  visibility?: 'public' | 'members' | 'paid' | 'tiers';
  featured?: boolean;         // Default: false
}
```

**Note:** HTML content is automatically sanitized to prevent XSS attacks.

---

### ghost_get_posts

Retrieves posts with pagination and filtering.

**Schema:**

```typescript
{
  status?: 'published' | 'draft' | 'scheduled' | 'all';
  limit?: number;     // 1-100, default: 15
  page?: number;      // Default: 1
  filter?: string;    // NQL filter
  order?: string;     // e.g., "published_at DESC"
  include?: string;   // e.g., "tags,authors"
}
```

---

### ghost_get_post

Retrieves a single post by ID or slug.

**Schema:**

```typescript
{
  id?: string;       // Ghost ID
  slug?: string;     // Post slug
  include?: string;  // Relations to include
}
```

---

### ghost_search_posts

Searches posts by title/content.

**Schema:**

```typescript
{
  query: string;     // Required: Search query
  status?: 'published' | 'draft' | 'scheduled' | 'all';
  limit?: number;    // 1-50, default: 15
}
```

---

### ghost_update_post

Updates an existing post.

**Schema:**

```typescript
{
  id: string; // Required: Ghost ID
  // All other post fields are optional
}
```

---

### ghost_delete_post

Deletes a post permanently.

**Schema:**

```typescript
{
  id: string; // Required: Ghost ID
}
```

---

## Page Tools

Pages are similar to posts but do **NOT** support tags.

### ghost_create_page

**Schema:**

```typescript
{
  title: string;              // Required
  html: string;               // Required
  status?: 'draft' | 'published' | 'scheduled';
  published_at?: string;
  feature_image?: string;
  meta_title?: string;
  meta_description?: string;
  // Note: No tags field
}
```

### ghost_get_pages, ghost_get_page, ghost_search_pages, ghost_update_page, ghost_delete_page

Same patterns as post tools, without tag support.

---

## Member Tools

### ghost_create_member

Creates a new member/subscriber.

**Schema:**

```typescript
{
  email: string;          // Required: Valid email
  name?: string;          // Member name
  note?: string;          // Internal notes
  labels?: string[];      // Label names
  newsletters?: string[]; // Newsletter IDs to subscribe
}
```

---

### ghost_get_members

Retrieves members with filtering.

**Schema:**

```typescript
{
  limit?: number;
  page?: number;
  filter?: string;
  order?: string;
  include?: string;  // e.g., "labels,newsletters"
}
```

---

### ghost_get_member

Retrieves a member by ID or email.

**Schema:**

```typescript
{
  id?: string;    // Ghost ID
  email?: string; // Member email
}
```

---

### ghost_search_members

Searches members by name or email.

**Schema:**

```typescript
{
  query: string;   // Required: Search query
  limit?: number;  // 1-50
}
```

---

### ghost_update_member

**Schema:**

```typescript
{
  id: string;             // Required
  email?: string;
  name?: string;
  note?: string;
  labels?: string[];
  newsletters?: string[];
}
```

---

### ghost_delete_member

**Schema:**

```typescript
{
  id: string; // Required
}
```

---

## Newsletter Tools

### ghost_create_newsletter

**Schema:**

```typescript
{
  name: string;                // Required: Newsletter name
  description?: string;
  sender_name?: string;
  sender_email?: string;
  subscribe_on_signup?: boolean;
}
```

### ghost_get_newsletters

**Schema:**

```typescript
{
  limit?: number;
  page?: number;
  filter?: string;
  order?: string;
}
```

### ghost_get_newsletter

**Schema:**

```typescript
{
  id: string; // Required
}
```

### ghost_update_newsletter

**Schema:**

```typescript
{
  id: string;   // Required
  name?: string;
  description?: string;
  sender_name?: string;
  sender_email?: string;
}
```

### ghost_delete_newsletter

**Schema:**

```typescript
{
  id: string; // Required
}
```

---

## Tier Tools

### ghost_create_tier

Creates a membership tier.

**Schema:**

```typescript
{
  name: string;          // Required: Tier name
  description?: string;  // Max 500 chars
  monthly_price?: number; // Price in cents
  yearly_price?: number;  // Price in cents
  currency?: string;      // 3-letter code (e.g., "USD")
  benefits?: string[];    // List of benefits
}
```

### ghost_get_tiers

**Schema:**

```typescript
{
  type?: 'free' | 'paid';
  limit?: number;
  page?: number;
  filter?: string;
}
```

### ghost_get_tier

**Schema:**

```typescript
{
  id: string; // Required
}
```

### ghost_update_tier

**Schema:**

```typescript
{
  id: string;  // Required
  name?: string;
  description?: string;
  monthly_price?: number;
  yearly_price?: number;
  benefits?: string[];
}
```

### ghost_delete_tier

**Schema:**

```typescript
{
  id: string; // Required
}
```

---

## Error Handling

All tools handle errors consistently:

1. **Validation Errors**: Input validation failures return detailed field-level errors
2. **Ghost API Errors**: Upstream Ghost API errors are caught and formatted
3. **Network Errors**: Connection issues return clear error messages

**Error Response Example:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\":\"ValidationError\",\"message\":\"Invalid email format\",\"field\":\"email\"}"
    }
  ],
  "isError": true
}
```

---

## Related Documentation

- [Schema Validation](./SCHEMA_VALIDATION.md) - Zod schema architecture
- [Error Handling](./ERROR_HANDLING.md) - Error types and patterns
- [MCP Transport](./MCP_TRANSPORT.md) - Transport configuration
