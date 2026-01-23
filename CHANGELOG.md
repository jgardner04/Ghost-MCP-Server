# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes

#### ghost_get_tags Default Limit Changed (PR #87)

**Changed:**
- `ghost_get_tags` tool default `limit` parameter changed from `'all'` (unlimited) to `15`

**Migration:**
- If you need all tags, explicitly set `limit: 'all'` in your queries
- For better performance, use pagination with explicit `limit` and `page` parameters

**Rationale:**
- Aligns with Ghost API best practices and schema-defined defaults
- Prevents performance issues when fetching large numbers of tags
- Encourages explicit pagination for scalability

**Example:**

Before (implicit behavior):
```javascript
// Returned ALL tags
await ghost_get_tags({})
```

After (explicit behavior required):
```javascript
// Returns first 15 tags only
await ghost_get_tags({})

// To get all tags (old behavior):
await ghost_get_tags({ limit: 'all' })

// Recommended approach for large tag lists:
await ghost_get_tags({ limit: 50, page: 1 })
```

### Added

- Comprehensive parameter support for `ghost_get_tags` tool (PR #87)
  - `limit`: Control number of tags returned (1-100 or 'all')
  - `page`: Page number for pagination
  - `order`: Sort results (e.g., "name ASC", "created_at DESC")
  - `include`: Include relations like post counts
  - `filter`: Advanced NQL filter expressions
  - `name`, `slug`, `visibility`: Simplified filtering options

- NQL filter security improvements (PR #87)
  - Added `escapeNqlValue()` helper to prevent filter injection attacks
  - Single quotes in filter values are properly escaped

### Fixed

- `ghost_get_posts` now properly passes `fields` and `formats` parameters to Ghost API (PR #87)
- `ghost_get_tags` now passes all query parameters to Ghost API instead of client-side filtering (PR #87)

### Security

- Fixed filter injection vulnerability in `ghost_get_tags` NQL filter construction (PR #87)
  - User-provided values in `name` and `slug` parameters are now properly escaped
  - Prevents malicious filter expressions from being injected

### Removed

- Broken npm scripts that referenced non-existent module (PR #104):
  - `npm run dev`
  - `npm run list`
  - `npm run generate`
  - `npm run parse-prd`
  - Note: These scripts were non-functional and have been removed

## [Initial Release]

### Added

- MCP server implementation with 34 tools across 7 resource types
- Express REST API server for Ghost CMS operations
- Support for Posts, Pages, Tags, Members, Newsletters, Tiers, and Images
- Comprehensive Zod schema validation with HTML sanitization
- Circuit breaker pattern and retry logic for Ghost API calls
- Image processing with Sharp
- SSRF-safe URL validation for image uploads
- Comprehensive test suite with >90% coverage
- Documentation for all tools, schemas, and error handling patterns
