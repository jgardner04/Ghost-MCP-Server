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

Retrieves a list of tags from Ghost CMS with advanced filtering and pagination.

**Schema:**

```typescript
{
  name?: string;       // Filter by exact tag name
  slug?: string;       // Filter by tag slug
  visibility?: 'public' | 'internal';  // Filter by visibility
  limit?: number | 'all';  // Results per page (1-100, default: 15, or 'all' for unlimited)
  page?: number;       // Page number for pagination (default: 1)
  order?: string;      // Sort order (e.g., "name ASC", "created_at DESC")
  include?: string;    // Relations to include (e.g., "count.posts")
  filter?: string;     // NQL (Ghost Query Language) filter string
}
```

**⚠️ Breaking Change:**
- **Default limit changed from 'all' to 15** in PR #87
- To retrieve all tags, set `limit: 'all'` or use pagination

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | - | Filter by exact tag name (case-sensitive) |
| `slug` | string | - | Filter by tag slug |
| `visibility` | enum | - | Filter by visibility: `'public'` or `'internal'` |
| `limit` | number \| 'all' | 15 | Number of tags to return (1-100, or 'all' for unlimited) |
| `page` | number | 1 | Page number for pagination |
| `order` | string | - | Sort field and direction (e.g., `"name ASC"`, `"created_at DESC"`) |
| `include` | string | - | Comma-separated relations to include (e.g., `"count.posts"`) |
| `filter` | string | - | NQL filter string for complex queries |

**Examples:**

Basic usage (returns first 15 tags):
```json
{}
```

Get all tags (for backward compatibility):
```json
{ "limit": "all" }
```

Filter by tag name:
```json
// Get first 10 tags, ordered by name
{
  "limit": 10,
  "order": "name ASC"
}

// Get public tags only
{
  "visibility": "public",
  "limit": 20
}

// Filter by name
{
  "name": "Technology"
}

// Filter by slug
{
  "slug": "javascript"
}

// Get all tags with post counts
{
  "limit": "all",
  "include": "count.posts"
}

// Complex NQL filter: tags with 'tech' in name
{
  "filter": "name:~'tech'",
  "limit": 50
}

// Pagination example
{
  "limit": 15,
  "page": 2,
  "order": "created_at DESC"
}
```

**NQL Filter Examples:**

```javascript
// Tags containing a substring (case-insensitive)
{ "filter": "name:~'javascript'" }

// Tags created after a date
{ "filter": "created_at:>'2024-01-01'" }

// Combine filters with + (AND)
{ "filter": "visibility:public+name:~'tech'" }

// Multiple conditions
{ "filter": "slug:javascript,slug:python" }  // OR condition
```

**Note:** Single quotes in filter strings are automatically escaped for security. If you have more than 15 tags and need all of them, explicitly set `limit: 'all'` or use pagination. See [Breaking Changes](#breaking-changes) for migration details.

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

Retrieves posts with pagination, filtering, and field selection.

**Schema:**

```typescript
{
  limit?: number;     // Results per page (1-100, default: 15)
  page?: number;      // Page number for pagination (default: 1)
  filter?: string;    // NQL filter string for complex queries
  order?: string;     // Sort order (e.g., "published_at DESC", "title ASC")
  include?: string;   // Relations to include (e.g., "tags,authors")
  fields?: string;    // Comma-separated list of fields to return
  formats?: string;   // Content formats to include (html, plaintext, mobiledoc)
}
```

**⚠️ Breaking Change:**
- **Default limit changed from 'all' to 15** in PR #87
- To retrieve all posts, set `limit: 100` and implement pagination

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 15 | Number of posts to return (1-100) |
| `page` | number | 1 | Page number for pagination |
| `filter` | string | - | NQL filter string (e.g., `"status:published+featured:true"`) |
| `order` | string | - | Sort field and direction (e.g., `"published_at DESC"`) |
| `include` | string | - | Comma-separated relations (e.g., `"tags,authors"`) |
| `fields` | string | - | Comma-separated fields to return (e.g., `"id,title,slug"`) |
| `formats` | string | - | Content formats: `"html"`, `"plaintext"`, `"mobiledoc"` (comma-separated) |

**Examples:**

```json
// Get first 10 published posts with tags
{
  "filter": "status:published",
  "limit": 10,
  "include": "tags,authors",
  "order": "published_at DESC"
}

// Get only specific fields (optimize response size)
{
  "fields": "id,title,slug,published_at",
  "limit": 50
}

// Get posts with plaintext format in addition to HTML
{
  "formats": "html,plaintext",
  "limit": 20
}

// Get featured posts only
{
  "filter": "featured:true",
  "limit": 5
}

// Pagination through all posts
{
  "limit": 15,
  "page": 2,
  "order": "created_at DESC"
}

// Posts by specific tag
{
  "filter": "tag:javascript",
  "include": "tags"
}

// Posts published in 2024
{
  "filter": "published_at:>='2024-01-01'+published_at:<'2025-01-01'",
  "order": "published_at DESC"
}

// Draft posts only
{
  "filter": "status:draft",
  "limit": 20
}
```

**Field Selection Examples:**

```json
// Minimal response - just IDs and titles
{
  "fields": "id,title"
}

// SEO fields only
{
  "fields": "id,title,meta_title,meta_description,og_title,og_description"
}

// Include all default fields plus custom ones
{
  "fields": "id,title,html,feature_image,custom_excerpt"
}
```

**Format Options:**

| Format | Description |
|--------|-------------|
| `html` | HTML content (default, always included) |
| `plaintext` | Plain text version of content |
| `mobiledoc` | Ghost's internal JSON format |

```json
// Get all three formats
{
  "formats": "html,plaintext,mobiledoc",
  "limit": 10
}
```

**NQL Filter Examples:**

```javascript
// Published posts only
{ "filter": "status:published" }

// Featured posts
{ "filter": "featured:true" }

// Posts with specific tag
{ "filter": "tag:javascript" }

// Posts by author email
{ "filter": "author:john@example.com" }

// Combine filters with + (AND)
{ "filter": "status:published+featured:true+tag:tutorial" }

// Date range
{ "filter": "published_at:>='2024-01-01'+published_at:<'2024-12-31'" }

// Visibility filter
{ "filter": "visibility:public" }

// Multiple tags (OR condition)
{ "filter": "tag:[javascript,typescript,nodejs]" }

// Exclude tag
{ "filter": "tag:-news" }

// Title contains text
{ "filter": "title:~'tutorial'" }
```

**Note:** Single quotes in filter strings are automatically escaped for security.

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

## NQL (Ghost Query Language) Filter Reference

NQL (Ghost Query Language) is used in `filter` parameters for advanced querying. This section provides a comprehensive reference for constructing NQL filters.

### Basic Syntax

```
field:value
```

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `:` | Equals | `status:published` |
| `:-` | Not equals | `status:-draft` |
| `:>` | Greater than | `created_at:>'2024-01-01'` |
| `:>=` | Greater than or equal | `published_at:>='2024-01-01'` |
| `:<` | Less than | `created_at:<'2024-12-31'` |
| `:<=` | Less than or equal | `created_at:<='2024-12-31'` |
| `:~` | Contains (case-insensitive) | `title:~'tutorial'` |
| `:[...]` | In array (OR) | `tag:[javascript,python]` |

### Combining Filters

| Combinator | Description | Example |
|------------|-------------|---------|
| `+` | AND | `status:published+featured:true` |
| `,` | OR (within same field) | `status:published,status:scheduled` |

### Common Filter Examples

**Posts:**
```javascript
// Published posts
"status:published"

// Featured posts published after 2024
"featured:true+published_at:>='2024-01-01'"

// Posts with specific tag
"tag:javascript"

// Posts with multiple tags (any)
"tag:[javascript,typescript,nodejs]"

// Posts without a tag
"tag:-archived"

// Posts by author
"author:john@example.com"

// Public posts only
"visibility:public"

// Title contains keyword
"title:~'guide'"

// Email-only posts
"email_only:true"
```

**Tags:**
```javascript
// Public tags only
"visibility:public"

// Tags with name containing keyword
"name:~'tech'"

// Tags created in 2024
"created_at:>='2024-01-01'+created_at:<'2025-01-01'"

// Multiple slugs
"slug:[javascript,python,ruby]"
```

**Members:**
```javascript
// Members subscribed to newsletter
"newsletters.id:507f1f77bcf86cd799439011"

// Members with specific label
"label:vip"

// Free members
"status:free"

// Paid members
"status:paid"

// Members created after date
"created_at:>'2024-01-01'"

// Email domain filter
"email:~'@company.com'"
```

### Field Types

**Boolean Fields:**
```javascript
"featured:true"
"featured:false"
```

**Date Fields:**
```javascript
// ISO 8601 format recommended
"published_at:>='2024-01-01'"
"created_at:<'2024-12-31'"

// Relative dates (if supported)
"updated_at:>'2024-01-01T00:00:00.000Z'"
```

**String Fields:**
```javascript
// Exact match
"status:published"

// Contains (case-insensitive)
"title:~'tutorial'"

// Not equals
"status:-draft"
```

**Array Fields (tags, authors, etc.):**
```javascript
// Has any of these values
"tag:[javascript,python]"

// Doesn't have this value
"tag:-archived"
```

### Complex Filter Examples

```javascript
// Published featured posts from 2024 with 'tutorial' tag
"status:published+featured:true+tag:tutorial+published_at:>='2024-01-01'"

// Posts that are either featured OR have tutorial tag
"featured:true,tag:tutorial"  // Note: This may not work; use multiple filters instead

// Draft or scheduled posts
"status:draft,status:scheduled"

// Posts published in Q1 2024
"published_at:>='2024-01-01'+published_at:<'2024-04-01'"

// Member posts with public visibility
"visibility:members+status:published"

// Posts with JavaScript or TypeScript tags
"tag:[javascript,typescript]"

// Posts updated in last year excluding archived
"updated_at:>='2024-01-01'+tag:-archived"
```

### Security Notes

- **Automatic Escaping**: Single quotes in filter strings are automatically escaped for security
- **Input Validation**: All filters are validated against a regex pattern to prevent injection attacks
- **Allowed Characters**: Filters can only contain: `a-z A-Z 0-9 _ - : . ' " space , [ ] < > = ! +`

### Limitations

1. **No nested parentheses**: You cannot group conditions with `(` and `)`
2. **OR across fields**: Cannot do `status:published OR featured:true` - use array syntax where applicable
3. **Case sensitivity**: Exact matches are case-sensitive; use `:~` for case-insensitive substring matching
4. **Regex not supported**: Use `:~` for substring matching only

### Best Practices

1. **Use specific filters**: More specific filters improve query performance
2. **Combine with pagination**: Use `limit` and `page` with filters for large result sets
3. **Test filters**: Verify filter syntax with simple queries before combining multiple conditions
4. **Order matters for readability**: Put most restrictive filters first
5. **Use include wisely**: Only include related data you need

### NQL Resources

- [Ghost NQL Documentation](https://ghost.org/docs/content-api/#filtering)
- [Ghost API Explorer](https://ghost.org/docs/admin-api/)

---

## Related Documentation

- [Schema Validation](./SCHEMA_VALIDATION.md) - Zod schema architecture
- [Error Handling](./ERROR_HANDLING.md) - Error types and patterns
- [MCP Transport](./MCP_TRANSPORT.md) - Transport configuration
