# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Security Requirements (OWASP Guidelines)

All code written for this project MUST follow OWASP security best practices to prevent common vulnerabilities:

### Required Security Measures:

1. **Input Validation & Sanitization**
   - Validate ALL user inputs using Joi schemas or express-validator
   - Sanitize HTML content using sanitize-html library
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
- `joi` - Input validation schemas
- `sanitize-html` - HTML sanitization
- `express-rate-limit` - Rate limiting
- `crypto` - Secure random generation and comparisons
- `helmet` - Security headers (to be added if not present)

## Project Overview

Ghost MCP Server - A Model Context Protocol (MCP) server that enables AI clients to interact with Ghost CMS instances via the Ghost Admin API. The project provides both an Express REST API server (port 3000) and an MCP server (port 3001) for managing Ghost blog content.

## Development Commands

### Core Development Commands

- **Start MCP Server**: `npm start` or `node src/index.js` - Starts both Express and MCP servers
- **Development Mode**: `npm run dev` - Runs the Task Master development workflow system
- **Build**: `npm run build` - Copies source files to build directory

### Task Master CLI Commands (for project task management)

- **List Tasks**: `npm run list` or `node scripts/dev.js list` - View all development tasks
- **Generate Task Files**: `npm run generate` - Create individual task files from tasks.json
- **Parse PRD**: `npm run parse-prd` - Convert a PRD document into structured tasks
- **Task Management**: Use the comprehensive Task Master system detailed in `.cursor/rules/dev_workflow.mdc`

## Architecture

### Core Components

1. **MCP Server** (`src/mcp_server.js`):

   - Implements Model Context Protocol specification
   - Exposes Ghost CMS functionality as MCP tools
   - Resources: `ghost/tag`, `ghost/post`
   - Tools: `ghost_create_tag`, `ghost_get_tags`, `ghost_upload_image`, `ghost_create_post`

2. **Express Server** (`src/index.js`):

   - REST API endpoints for Ghost operations
   - Routes: `/api/posts`, `/api/images`, `/api/tags`
   - Health check endpoint: `/health`

3. **Services Layer** (`src/services/`):

   - `ghostService.js`: Ghost Admin API wrapper with retry logic
   - `postService.js`: Post creation and management
   - `imageProcessingService.js`: Image optimization and processing

4. **Controllers** (`src/controllers/`):

   - Handle HTTP requests for posts, images, and tags
   - Validate inputs and coordinate with services

5. **Task Master System** (`scripts/`):
   - AI-driven development workflow management
   - Task complexity analysis and subtask generation
   - Modular architecture in `scripts/modules/`

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
ANTHROPIC_API_KEY=...    # For Task Master CLI
PERPLEXITY_API_KEY=...   # For research-backed task analysis
```

## MCP Tool Usage Guide

When implementing Ghost CMS operations via MCP:

1. **Image Upload Flow**:

   - First call `ghost_upload_image` with imageUrl
   - Use returned URL for `feature_image` in post creation

2. **Tag Management**:

   - Use `ghost_get_tags` to check existing tags
   - Create new tags with `ghost_create_tag` if needed
   - Reference tags by name when creating posts

3. **Post Creation**:
   - Tags are auto-created if they don't exist
   - Status options: 'draft', 'published', 'scheduled'
   - HTML content is required for post body

## Task Master Workflow

The project uses an advanced task management system. Key commands:

- Analyze task complexity before implementation
- Use `expand` command to break down complex tasks
- Track progress with task status updates
- Maintain dependency chains between tasks

Refer to `.cursor/rules/dev_workflow.mdc` for comprehensive Task Master documentation.

## Key Dependencies

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `@tryghost/admin-api`: Official Ghost Admin API client
- `express`: REST API framework
- `sharp`: Image processing
- `@anthropic-ai/sdk`: Task Master AI features
