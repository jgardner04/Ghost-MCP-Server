# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Security Requirements (OWASP Guidelines)

All code written for this project MUST follow OWASP security best practices to prevent common vulnerabilities:

### Required Security Measures:

1. **Input Validation & Sanitization**
   - Validate ALL user inputs using Zod schemas from `src/schemas/`
   - HTML sanitization is integrated into the schema layer (`src/schemas/common.js`)
   - Reject inputs that don't match expected patterns
   - Use allowlists for acceptable values, not denylists

2. **Path Traversal Prevention**
   - Always resolve and validate file paths against expected directories
   - Use `path.resolve()` and verify paths start with allowed base directories
   - Never use user input directly in file system operations
   - Generate cryptographically secure filenames for uploads

3. **XSS (Cross-Site Scripting) Prevention**
   - Sanitize all HTML content before storage or display
   - Escape special characters in user-generated content
   - Use Content Security Policy headers
   - Never use `eval()` or `new Function()` with user input

4. **SQL Injection Prevention**
   - Use parameterized queries (though this project uses Ghost API, not direct SQL)
   - Escape special characters in filter strings
   - Validate query parameters against expected formats

5. **Authentication & Authorization**
   - Use constant-time comparison for secrets (crypto.timingSafeEqual)
   - Implement rate limiting on sensitive endpoints
   - Validate API keys and tokens securely
   - Never log sensitive information

6. **Additional Security Controls**
   - Set appropriate HTTP security headers
   - Implement request size limits
   - Use HTTPS for external requests
   - Validate URLs to prevent SSRF attacks
   - Clean up temporary files securely
   - Log security events appropriately

### Security Libraries in Use:

- `zod` - Runtime type validation and schema definition (primary validation)
- `sanitize-html` - HTML sanitization (integrated into Zod schemas)
- `express-rate-limit` - Rate limiting
- `crypto` - Secure random generation and comparisons
- `helmet` - HTTP security headers
- `joi` - Legacy validation (used in some REST endpoints)

## Git Workflow (Required)

**ALWAYS create a feature branch before making ANY code changes.**

```bash
git checkout main
git pull origin main
git checkout -b <type>/issue-<number>-<description>
```

### Branch Naming Convention

- `feature/` - New features (e.g., `feature/issue-42-add-pagination`)
- `fix/` - Bug fixes (e.g., `fix/issue-15-image-upload-error`)
- `docs/` - Documentation changes (e.g., `docs/update-api-reference`)
- `refactor/` - Code refactoring (e.g., `refactor/issue-30-simplify-auth`)
- `test/` - Test additions or fixes (e.g., `test/add-member-service-tests`)

### Workflow Steps

1. **Create branch** before writing any code
2. **Make changes** on the feature branch
3. **Commit** with clear, descriptive messages
4. **Push** to remote and create a pull request
5. **Never commit directly to `main`** - all changes must go through PRs

## Project Overview

Ghost MCP Server - A Model Context Protocol (MCP) server that enables AI clients to interact with Ghost CMS instances via the Ghost Admin API. The project provides both an Express REST API server (port 3000) and an MCP server (port 3001) for managing Ghost blog content.

## Development Commands

### Core Development Commands

- **Start Express + MCP**: `npm start` or `node src/index.js` - Starts both Express REST API and MCP servers
- **Start MCP Only**: `npm run start:mcp` - Starts improved MCP server with default transport
- **MCP with stdio**: `npm run start:mcp:stdio` - Stdio transport (for CLI tools like Claude Desktop)
- **MCP with HTTP/SSE**: `npm run start:mcp:http` - HTTP transport with Server-Sent Events
- **MCP with WebSocket**: `npm run start:mcp:websocket` - WebSocket transport for real-time apps
- **Build**: `npm run build` - Copies source files to build directory

## Testing (Test-Driven Development)

This project follows Test-Driven Development (TDD) practices.

### TDD Requirement

**All new features and bug fixes MUST be developed using TDD:**

1. **Red**: Write a failing test first
2. **Green**: Write minimal code to make the test pass
3. **Refactor**: Improve the code while keeping tests green

### Test File Conventions

- **Location**: Place tests alongside source files in `__tests__/` directories
  - Example: `src/services/__tests__/ghostService.test.js`
- **Naming**: Use `*.test.js` or `*.spec.js` suffix
- **Framework**: Vitest (not Jest)
- **Organization**: Use `describe` blocks for modules/functions, `it` for test cases

### Coverage Requirements

- **Minimum coverage**: 80% for lines, branches, functions, and statements
- Coverage is enforced in CI pipeline
- Tests failing or coverage below threshold will block merges

### Testing Commands

- `npm test` - Run tests once
- `npm run test:watch` - Run tests in watch mode (use during development)
- `npm run test:coverage` - Run tests with coverage report

## Code Quality Principles

Follow these principles when writing code:

1. **Never disable lint rules as workarounds**
   - If ESLint flags an issue, fix the underlying problem
   - Don't use `// eslint-disable` comments unless absolutely necessary
   - If you must disable a rule, add a detailed comment explaining why

2. **Prefer proper fixes over suppressions**
   - Refactor code to comply with rules instead of disabling them
   - Use type assertions only when you have more information than the linter

3. **Follow existing patterns in the codebase**
   - Read similar code before implementing new features
   - Match the architectural patterns already established
   - Keep consistency in naming, structure, and error handling

4. **Write self-documenting code**
   - Use clear, descriptive variable and function names
   - Add comments only when the "why" isn't obvious from the code
   - Keep functions small and focused on a single responsibility

### Code Quality Commands

- `npm run lint` - Check code for linting errors
- `npm run lint:fix` - Automatically fix linting errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is formatted correctly
- `npm run prepare` - Set up Husky git hooks (pre-commit, pre-push)

**Note:** Git hooks automatically run linting and tests before commits/pushes.

## Architecture

### Core Components

1. **MCP Server** (`src/mcp_server_improved.js`):
   - Implements Model Context Protocol specification with Zod validation
   - Exposes Ghost CMS functionality as 34 MCP tools across 7 resource types
   - Resources: `ghost/post`, `ghost/page`, `ghost/tag`, `ghost/member`, `ghost/newsletter`, `ghost/tier`
   - Tools by resource:
     - **Posts** (6): `ghost_create_post`, `ghost_get_posts`, `ghost_get_post`, `ghost_search_posts`, `ghost_update_post`, `ghost_delete_post`
     - **Pages** (6): `ghost_create_page`, `ghost_get_pages`, `ghost_get_page`, `ghost_search_pages`, `ghost_update_page`, `ghost_delete_page`
     - **Tags** (5): `ghost_create_tag`, `ghost_get_tags`, `ghost_get_tag`, `ghost_update_tag`, `ghost_delete_tag`
     - **Members** (6): `ghost_create_member`, `ghost_get_members`, `ghost_get_member`, `ghost_search_members`, `ghost_update_member`, `ghost_delete_member`
     - **Newsletters** (5): `ghost_create_newsletter`, `ghost_get_newsletters`, `ghost_get_newsletter`, `ghost_update_newsletter`, `ghost_delete_newsletter`
     - **Tiers** (5): `ghost_create_tier`, `ghost_get_tiers`, `ghost_get_tier`, `ghost_update_tier`, `ghost_delete_tier`
     - **Images** (1): `ghost_upload_image`

2. **Express Server** (`src/index.js`):
   - REST API endpoints for Ghost operations
   - Routes: `/api/posts`, `/api/images`, `/api/tags`
   - Health check endpoint: `/health`

3. **Services Layer** (`src/services/`):
   - `ghostService.js`: Basic Ghost Admin API wrapper
   - `ghostServiceImproved.js`: Enhanced Ghost Admin API wrapper with circuit breaker, retry logic, and validation
   - `postService.js`: Post creation and management
   - `pageService.js`: Page creation and management
   - `memberService.js`: Member/subscriber management
   - `tierService.js`: Membership tier management
   - `newsletterService.js`: Newsletter management
   - `imageProcessingService.js`: Image optimization and processing

4. **Controllers** (`src/controllers/`):
   - Handle HTTP requests for posts, images, and tags
   - Validate inputs and coordinate with services

5. **Schemas Layer** (`src/schemas/`):
   - `common.js`: Shared Zod validators (IDs, emails, URLs) with HTML sanitization
   - `postSchemas.js`: Post creation, update, and query schemas
   - `pageSchemas.js`: Page schemas
   - `tagSchemas.js`: Tag schemas with name/slug validation
   - `memberSchemas.js`: Member creation, update, and query schemas
   - `newsletterSchemas.js`: Newsletter schemas
   - `tierSchemas.js`: Tier/membership schemas
   - `index.js`: Centralized schema exports

6. **Utilities** (`src/utils/`):
   - `validation.js`: MCP tool input validation helper (`validateToolInput`)
   - `tempFileManager.js`: Temp file tracking and cleanup with process exit handlers
   - `urlValidator.js`: SSRF-safe URL validation for image downloads
   - `logger.js`: Context-aware logging with request correlation

### Environment Configuration

Required environment variables in `.env`:

```
GHOST_ADMIN_API_URL=https://your-ghost-site.com
GHOST_ADMIN_API_KEY=your_admin_api_key
```

Optional:

```
PORT=3000                 # Express REST API port
MCP_PORT=3001            # MCP server port
```

## Documentation

This project maintains detailed documentation in the `docs/` directory:

| File                                                   | Description                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [docs/ERROR_HANDLING.md](docs/ERROR_HANDLING.md)       | Error types, circuit breaker pattern, retry mechanisms, error logging strategies               |
| [docs/MCP_TRANSPORT.md](docs/MCP_TRANSPORT.md)         | Transport configuration (stdio, HTTP/SSE, WebSocket), use cases, security considerations       |
| [docs/RESOURCE_FETCHING.md](docs/RESOURCE_FETCHING.md) | Resource URI patterns, caching strategies (LRU/TTL), real-time subscriptions, batch operations |
| [docs/TESTING.md](docs/TESTING.md)                     | Manual testing setup with Ghost CMS, MCP Inspector usage, debugging tips                       |
| [docs/TOOLS_REFERENCE.md](docs/TOOLS_REFERENCE.md)     | Comprehensive reference for all 34 MCP tools with schemas and examples                         |
| [docs/SCHEMA_VALIDATION.md](docs/SCHEMA_VALIDATION.md) | Zod schema architecture, validators, HTML sanitization, and usage patterns                     |

### When to Update Documentation

Update documentation when you:

- Add new error types or change error handling patterns → Update ERROR_HANDLING.md
- Modify transport configuration or add transport options → Update MCP_TRANSPORT.md
- Change resource URI patterns or caching behavior → Update RESOURCE_FETCHING.md
- Add new manual testing procedures → Update TESTING.md

### Post-Task Documentation Checklist

After completing a task, verify:

- [ ] Updated relevant documentation files if patterns changed
- [ ] Added examples for new features in appropriate docs
- [ ] Updated CLAUDE.md if development workflow changed
- [ ] Documented any new environment variables in this file

## Task Tracking for Multi-Session Work

For complex tasks that span multiple work sessions, create task files to track progress.

### When to Create Task Files

Create a task file in `docs/tasks/` when:

- The task will take multiple sessions to complete
- You need to track subtasks and their dependencies
- You want to document decisions made during implementation
- The task involves coordinating changes across multiple files

### Task File Template

Create files as `docs/tasks/issue-XX-brief-description.md`:

```markdown
# Task: [Brief Description]

**Issue:** #XX
**Status:** In Progress | Blocked | Completed
**Started:** YYYY-MM-DD

## Goal

[What you're trying to accomplish]

## Subtasks

- [ ] Subtask 1
- [ ] Subtask 2
- [x] Completed subtask

## Progress Log

### YYYY-MM-DD

- Completed subtask X
- Discovered issue with Y
- Next: Work on Z

## Decisions

- [Document key architectural or implementation decisions]

## Blockers

- [List anything blocking progress]
```

### Using Task Files

1. **Create** the task file when starting multi-session work
2. **Update** the Progress Log at the end of each session
3. **Check off** subtasks as you complete them
4. **Document** important decisions and blockers
5. **Delete** the task file when work is complete and merged

## MCP Tool Usage Guide

When implementing Ghost CMS operations via MCP:

1. **Image Upload Flow**:
   - First call `ghost_upload_image` with imageUrl
   - Use returned URL for `feature_image` in post/page creation

2. **Tag Management**:
   - Use `ghost_get_tags` to list existing tags
   - Use `ghost_get_tag` to get a specific tag by ID or slug
   - Create new tags with `ghost_create_tag` if needed
   - Update tags with `ghost_update_tag`
   - Reference tags by name when creating posts (auto-created if missing)

3. **Post Creation**:
   - Tags are auto-created if they don't exist
   - Status options: 'draft', 'published', 'scheduled'
   - HTML content is required for post body
   - Use `ghost_search_posts` to find posts by title/content

4. **Page Management**:
   - Similar to posts but without tag support
   - Use `ghost_create_page`, `ghost_get_page`, `ghost_update_page`, `ghost_delete_page`
   - Use `ghost_search_pages` to find pages by title/content

5. **Member Management**:
   - Use `ghost_create_member` to add subscribers
   - Use `ghost_get_member` to lookup by ID or email
   - Use `ghost_search_members` to find members by name/email
   - Update member data with `ghost_update_member`

6. **Newsletter Management**:
   - Use `ghost_get_newsletters` to list all newsletters
   - Create newsletters with `ghost_create_newsletter`
   - Configure sender details, subscription settings

7. **Tier Management**:
   - Use `ghost_get_tiers` to list membership levels
   - Create tiers with `ghost_create_tier`
   - Configure pricing (monthly/yearly), currency, descriptions

## Key Dependencies

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `@tryghost/admin-api`: Official Ghost Admin API client
- `zod`: Runtime type validation and schema definition
- `sanitize-html`: HTML sanitization for XSS prevention
- `express`: REST API framework
- `sharp`: Image processing
- `helmet`: HTTP security headers
- `express-rate-limit`: Rate limiting middleware
