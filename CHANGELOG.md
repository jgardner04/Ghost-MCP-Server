# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **JSON Schema regression tests for MCP tool schemas** - Added tests verifying every registered tool produces non-empty JSON Schema `properties` via the same `zod/v4-mini` conversion path the MCP SDK uses. Includes targeted assertions that `ghost_create_post` and `ghost_create_page` declare `title` and `html` as required. Prevents a regression where empty schemas caused MCP clients to strip arguments. ([JON-103](https://linear.app/jonathangardner/issue/JON-103/declare-input-schema-for-ghost-create-post-tool))

### Removed

- **Redundant `.response` assignment on 404 GhostAPIError mocks** - Removed manual `error404.response = { status: 404 }` assignments from 4 test files (posts, pages, tags, members). `GhostAPIError` already sets `this.statusCode = 404`, and `fromGhostError` falls back to `error.statusCode` when `error.response?.status` is absent. ([JON-80](https://linear.app/jonathangardner/issue/JON-80/remove-redundant-response-assignment-on-404-ghostapierror-mocks))

### Changed

- **Extract shared CRUD resource factory** - Introduced `createResourceService()` factory to eliminate duplicated CRUD patterns (create/update/delete/getOne/getList) across 6 domain service modules. Posts, Pages, Members, Newsletters, and Tiers now delegate common operations to the factory while preserving domain-specific logic as config hooks. ([JON-36](https://linear.app/jonathangardner/issue/JON-36/extract-shared-crud-resource-factory-to-eliminate-postpage-duplication), [#144](https://github.com/jgardner04/Ghost-MCP-Server/pull/144))
- **Split ghostServiceImproved.js by domain** - Decomposed the 1295-line monolithic service file into 9 focused modules (`ghostApiClient.js`, `validators.js`, `posts.js`, `pages.js`, `tags.js`, `members.js`, `newsletters.js`, `tiers.js`, `images.js`) with a barrel re-export for backward compatibility. ([JON-37](https://linear.app/jonathangardner/issue/JON-37/split-1160-line-ghostserviceimprovedjs-by-domain), [#143](https://github.com/jgardner04/Ghost-MCP-Server/pull/143))
- **Dual schema passing comment** - Added explanatory comment to `withErrorHandling` JSDoc clarifying why each `registerTool` call passes the schema twice (MCP protocol metadata vs. runtime validation). ([JON-83](https://linear.app/jonathangardner/issue/JON-83/add-comment-explaining-why-schema-is-passed-twice-in-registertool), [#142](https://github.com/jgardner04/Ghost-MCP-Server/pull/142))
- **Standardized tool error handling** - Extracted `withErrorHandling` higher-order function to eliminate ~735 lines of duplicated try/catch blocks across 33 tool handlers. Error messages now use a consistent `Error in <tool_name>: <message>` format. ([JON-17](https://linear.app/jonathangardner/issue/JON-17/extract-error-handler-hof-in-mcp-serverjs-to-reduce-duplication), [#138](https://github.com/jgardner04/Ghost-MCP-Server/pull/138))
- **JSDoc documentation, validation helper extraction, and export cleanup** - Added `@param`/`@returns`/`@throws` JSDoc to ~32 functions, extracted `validators.requireId()` shared helper replacing 10+ inline ID checks, and removed unused `handleApiRequest` backward-compat export. ([JON-18](https://linear.app/jonathangardner/issue/JON-18/jsdoc-gaps-unused-export-cleanup-and-validation-helper-extraction), [#141](https://github.com/jgardner04/Ghost-MCP-Server/pull/141))
- **Shared test mock factory for Ghost Admin API** - Extracted duplicated `vi.mock('@tryghost/admin-api')` blocks from 6 test files into a single `mockGhostApi.js` helper with `createMockGhostApi()`, `createMockGhostApiConstructor()`, and `mockGhostApiModule()` exports. Fixes silent inconsistency where the pages test was missing the `members` resource. ([JON-38](https://linear.app/jonathangardner/issue/JON-38/extract-shared-test-mock-factory-for-ghost-admin-api), [#127](https://github.com/jgardner04/Ghost-MCP-Server/pull/127))

### Fixed

- **Defensive check for slug/undefined identifier pattern** - Added runtime assertions in `ghost_get_tag`, `ghost_get_post`, and `ghost_get_page` handlers to prevent `slug/undefined` identifier construction when neither `id` nor `slug` is provided. The Zod schema `.refine()` already validates at the schema layer; this adds belt-and-suspenders safety. ([JON-84](https://linear.app/jonathangardner/issue/JON-84/add-defensive-check-for-slugundefined-identifier-pattern), [#138](https://github.com/jgardner04/Ghost-MCP-Server/pull/138))
- **Scheduled status validation on published_at-only updates** - `updatePost` and `updatePage` now validate scheduled-date constraints when only `published_at` changes (without `status` in the update payload). Previously, a scheduled post/page could have its publish date set to the past without triggering validation. ([JON-19](https://linear.app/jonathangardner/issue/JON-19/edge-case-validatescheduledstatus-skipped-when-only-published-at), [#136](https://github.com/jgardner04/Ghost-MCP-Server/pull/136))

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
await ghost_get_tags({});
```

After (explicit behavior required):

```javascript
// Returns first 15 tags only
await ghost_get_tags({});

// To get all tags (old behavior):
await ghost_get_tags({ limit: 'all' });

// Recommended approach for large tag lists:
await ghost_get_tags({ limit: 50, page: 1 });
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

- `ghost_get_tier` and `ghost_update_tier` now pass arguments in the correct order to the Ghost SDK (JON-41)
  - `read` and `edit` operations for tiers were failing due to incorrect `handleApiRequest` argument ordering
  - `id` is now correctly placed on the data object (first arg) for `edit` calls, matching all other resources
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
