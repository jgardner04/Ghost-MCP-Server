# Ghost MCP Server

[![npm version](https://badge.fury.io/js/%40jgardner04%2Fghost-mcp-server.svg)](https://badge.fury.io/js/%40jgardner04%2Fghost-mcp-server)
[![CI](https://github.com/jgardner04/Ghost-MCP-Server/actions/workflows/ci.yml/badge.svg)](https://github.com/jgardner04/Ghost-MCP-Server/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen.svg)](https://github.com/jgardner04/Ghost-MCP-Server)

This project (`ghost-mcp-server`) implements a **Model Context Protocol (MCP) Server** that allows an MCP client (like Cursor or Claude Desktop) to interact with a Ghost CMS instance via defined tools.

## Requirements

- Node.js 18.0.0 or higher
- Ghost Admin API URL and Key

## Ghost MCP Server Details

This server exposes Ghost CMS management functions as MCP tools, allowing an AI client like Cursor or Claude Desktop to manage a Ghost blog.

An MCP client can discover these resources and tools by querying the running MCP server (typically listening on port 3001 by default) at its root endpoint (e.g., `http://localhost:3001/`). The server responds with its capabilities according to the Model Context Protocol specification.

### Resources Defined

- **`ghost/tag`**: Represents a tag in Ghost CMS. Contains `id`, `name`, `slug`, `description`.
- **`ghost/post`**: Represents a post in Ghost CMS. Contains `id`, `title`, `slug`, `html`, `status`, `feature_image`, `published_at`, `tags`, metadata fields.
- **`ghost/page`**: Represents a page in Ghost CMS. Similar to posts but without tag support.
- **`ghost/member`**: Represents a member/subscriber in Ghost CMS. Contains `id`, `email`, `name`, `status`, `labels`, subscriptions.
- **`ghost/newsletter`**: Represents a newsletter in Ghost CMS. Contains `id`, `name`, `description`, sender settings.
- **`ghost/tier`**: Represents a membership tier in Ghost CMS. Contains `id`, `name`, `description`, pricing, benefits.

_(Refer to `src/mcp_server.js` for full resource schemas.)_

### Tools Defined

The Ghost MCP Server provides **34 tools** across 7 resource types. Below is a comprehensive guide:

---

#### Tag Tools (5 tools)

1.  **`ghost_create_tag`** - Creates a new tag.
    - `name` (string, required): The name for the new tag.
    - `description` (string, optional): A description for the tag.
    - `slug` (string, optional): A URL-friendly slug (auto-generated if omitted).

2.  **`ghost_get_tags`** - Retrieves a list of tags with optional filtering.
    - `name` (string, optional): Filter tags by exact name.
    - `limit`, `page`, `order` (optional): Pagination and sorting options.

3.  **`ghost_get_tag`** - Retrieves a single tag by ID or slug.
    - `id` (string, optional): The ID of the tag.
    - `slug` (string, optional): The slug of the tag.
    - `include` (string, optional): Additional resources to include (e.g., "count.posts").

4.  **`ghost_update_tag`** - Updates an existing tag.
    - `id` (string, required): The ID of the tag to update.
    - `name`, `description`, `slug` (optional): Fields to update.

5.  **`ghost_delete_tag`** - Deletes a tag permanently.
    - `id` (string, required): The ID of the tag to delete.

---

#### Image Tools (1 tool)

6.  **`ghost_upload_image`** - Downloads, processes, and uploads an image to Ghost.
    - `imageUrl` (string, required): A publicly accessible URL of the image.
    - `alt` (string, optional): Alt text (auto-generated if omitted).
    - **Returns**: `{ url, alt }` - the Ghost URL and alt text.
    - **Usage Note**: Call this first to get a Ghost image URL before creating posts/pages.

---

#### Post Tools (6 tools)

7.  **`ghost_create_post`** - Creates a new post.
    - `title` (string, required): The title of the post.
    - `html` (string, required): The main content in HTML format.
    - `status` (string, optional): 'draft', 'published', or 'scheduled'.
    - `tags` (array, optional): Tag names (auto-created if missing).
    - `published_at` (ISO date, optional): Required if status is 'scheduled'.
    - `feature_image`, `feature_image_alt`, `feature_image_caption` (optional): Featured image settings.
    - `custom_excerpt`, `meta_title`, `meta_description` (optional): SEO fields.

8.  **`ghost_get_posts`** - Retrieves posts with pagination and filtering.
    - `status` (optional): Filter by 'published', 'draft', 'scheduled', or 'all'.
    - `limit`, `page`, `filter`, `order`, `include` (optional): Query options.

9.  **`ghost_get_post`** - Retrieves a single post by ID or slug.
    - `id` (string, optional): The ID of the post.
    - `slug` (string, optional): The slug of the post.
    - `include` (string, optional): Relations to include (e.g., "tags,authors").

10. **`ghost_search_posts`** - Searches posts by title/content.
    - `query` (string, required): Search query.
    - `status` (optional): Filter by status.
    - `limit` (optional): Max results (1-50).

11. **`ghost_update_post`** - Updates an existing post.
    - `id` (string, required): The ID of the post to update.
    - All other post fields are optional.

12. **`ghost_delete_post`** - Deletes a post permanently.
    - `id` (string, required): The ID of the post to delete.

---

#### Page Tools (6 tools)

13. **`ghost_create_page`** - Creates a new page (pages do NOT support tags).
    - `title` (string, required): The title of the page.
    - `html` (string, required): The main content in HTML format.
    - `status`, `published_at`, `feature_image`, SEO fields (optional).

14. **`ghost_get_pages`** - Retrieves pages with pagination and filtering.
    - `limit`, `page`, `filter`, `order`, `include` (optional): Query options.

15. **`ghost_get_page`** - Retrieves a single page by ID or slug.
    - `id` (string, optional): The ID of the page.
    - `slug` (string, optional): The slug of the page.

16. **`ghost_search_pages`** - Searches pages by title/content.
    - `query` (string, required): Search query.
    - `status`, `limit` (optional): Filtering options.

17. **`ghost_update_page`** - Updates an existing page.
    - `id` (string, required): The ID of the page to update.

18. **`ghost_delete_page`** - Deletes a page permanently.
    - `id` (string, required): The ID of the page to delete.

---

#### Member Tools (6 tools)

19. **`ghost_create_member`** - Creates a new member/subscriber.
    - `email` (string, required): The member's email address.
    - `name` (string, optional): The member's name.
    - `note` (string, optional): Internal notes about the member.
    - `labels` (array, optional): Labels to assign.
    - `newsletters` (array, optional): Newsletter IDs to subscribe to.

20. **`ghost_get_members`** - Retrieves members with pagination and filtering.
    - `limit`, `page`, `filter`, `order`, `include` (optional): Query options.

21. **`ghost_get_member`** - Retrieves a single member by ID or email.
    - `id` (string, optional): The ID of the member.
    - `email` (string, optional): The email of the member.

22. **`ghost_search_members`** - Searches members by name or email.
    - `query` (string, required): Search query.
    - `limit` (optional): Max results (1-50).

23. **`ghost_update_member`** - Updates an existing member.
    - `id` (string, required): The ID of the member to update.
    - `email`, `name`, `note`, `labels`, `newsletters` (optional).

24. **`ghost_delete_member`** - Deletes a member permanently.
    - `id` (string, required): The ID of the member to delete.

---

#### Newsletter Tools (5 tools)

25. **`ghost_create_newsletter`** - Creates a new newsletter.
    - `name` (string, required): The newsletter name.
    - `description` (string, optional): Newsletter description.
    - `sender_name`, `sender_email` (optional): Sender configuration.
    - `subscribe_on_signup` (boolean, optional): Auto-subscribe new members.

26. **`ghost_get_newsletters`** - Retrieves all newsletters with filtering.
    - `limit`, `page`, `filter`, `order` (optional): Query options.

27. **`ghost_get_newsletter`** - Retrieves a single newsletter by ID.
    - `id` (string, required): The ID of the newsletter.

28. **`ghost_update_newsletter`** - Updates an existing newsletter.
    - `id` (string, required): The ID of the newsletter to update.
    - `name`, `description`, sender settings (optional).

29. **`ghost_delete_newsletter`** - Deletes a newsletter permanently.
    - `id` (string, required): The ID of the newsletter to delete.

---

#### Tier Tools (5 tools)

30. **`ghost_create_tier`** - Creates a new membership tier.
    - `name` (string, required): The tier name.
    - `description` (string, optional): Tier description.
    - `monthly_price`, `yearly_price` (number, optional): Pricing in cents.
    - `currency` (string, optional): 3-letter currency code (e.g., "USD").
    - `benefits` (array, optional): List of tier benefits.

31. **`ghost_get_tiers`** - Retrieves all tiers with filtering.
    - `type` (optional): Filter by 'free' or 'paid'.
    - `limit`, `page`, `filter` (optional): Query options.

32. **`ghost_get_tier`** - Retrieves a single tier by ID.
    - `id` (string, required): The ID of the tier.

33. **`ghost_update_tier`** - Updates an existing tier.
    - `id` (string, required): The ID of the tier to update.
    - Pricing, benefits, and other tier fields (optional).

34. **`ghost_delete_tier`** - Deletes a tier permanently.
    - `id` (string, required): The ID of the tier to delete.

## Installation

### NPM Installation (Recommended)

Install globally using npm:

```bash
npm install -g @jgardner04/ghost-mcp-server
```

Or use npx to run without installing:

```bash
npx @jgardner04/ghost-mcp-server
```

### Available Commands

After installation, the following CLI commands are available:

- **`ghost-mcp-server`**: Starts the Express REST API server and MCP server (default)
- **`ghost-mcp`**: Starts the improved MCP server with transport configuration support

### Configuration

Before running the server, configure your Ghost Admin API credentials:

1. Create a `.env` file in your working directory:

   ```dotenv
   # Required:
   GHOST_ADMIN_API_URL=https://your-ghost-site.com
   GHOST_ADMIN_API_KEY=your_admin_api_key
   ```

2. Find your Ghost Admin API URL and Key in your Ghost Admin settings under Integrations -> Custom Integrations.

### Running the Server

After installation and configuration:

```bash
# Using the global installation
ghost-mcp-server

# Or using npx
npx @jgardner04/ghost-mcp-server

# Run the improved MCP server (recommended for MCP clients)
ghost-mcp

# Or with specific transport
MCP_TRANSPORT=stdio ghost-mcp
MCP_TRANSPORT=http ghost-mcp
MCP_TRANSPORT=websocket ghost-mcp
```

### Available npm Scripts

For development, the following scripts are available:

| Script                        | Description                          |
| ----------------------------- | ------------------------------------ |
| `npm start`                   | Start Express REST API + MCP servers |
| `npm run start:mcp`           | Start improved MCP server only       |
| `npm run start:mcp:stdio`     | MCP server with stdio transport      |
| `npm run start:mcp:http`      | MCP server with HTTP/SSE transport   |
| `npm run start:mcp:websocket` | MCP server with WebSocket transport  |
| `npm test`                    | Run tests                            |
| `npm run test:coverage`       | Run tests with coverage report       |
| `npm run lint`                | Check code for linting errors        |
| `npm run lint:fix`            | Auto-fix linting errors              |

## Development Setup

For contributors or advanced users who want to modify the source code:

1.  **Clone the Repository**:

    ```bash
    git clone https://github.com/jgardner04/Ghost-MCP-Server.git
    cd Ghost-MCP-Server
    ```

2.  **Install Dependencies**:

    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Create a `.env` file in the project root (see Configuration section above).

4.  **Run from Source**:

    ```bash
    npm start
    # OR directly:
    # node src/index.js
    ```

5.  **Development Mode (using nodemon)**:
    For development with automatic restarting:
    ```bash
    npm run dev
    ```

## Troubleshooting

- **401 Unauthorized Error from Ghost:** Check that your `GHOST_ADMIN_API_URL` and `GHOST_ADMIN_API_KEY` in the `.env` file are correct and that the Custom Integration in Ghost is enabled.
- **MCP Server Connection Issues:** Ensure the MCP server is running (check console logs). Verify the port (`MCP_PORT`, default 3001) is not blocked by a firewall. Check that the client is connecting to the correct address and port.
- **Tool Execution Errors:** Check the server console logs for detailed error messages from the specific tool implementation. Common issues include invalid input (check against tool schemas in `src/mcp_server.js` and the README guide), problems downloading from `imageUrl`, image processing failures, or upstream errors from the Ghost API.
- **Command Not Found:** If `ghost-mcp-server` or `ghost-mcp` commands are not found after global installation, ensure npm's global bin directory is in your PATH. You can find it with `npm bin -g`.
- **Dependency Installation Issues:** Ensure you have a compatible Node.js version installed (Node.js 18.0.0 or higher - see Requirements section). For global installation issues, try `npm install -g @jgardner04/ghost-mcp-server --force`. For development setup, try removing `node_modules` and `package-lock.json` and running `npm install` again.
