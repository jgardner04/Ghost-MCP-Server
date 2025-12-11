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
- **`ghost/post`**: Represents a post in Ghost CMS. Contains `id`, `title`, `slug`, `html`, `status`, `feature_image`, `published_at`, `tags` (array of `ghost/tag`), metadata fields, etc.

_(Refer to `src/mcp_server.js` for full resource schemas.)_

### Tools Defined

Below is a guide for using the available MCP tools:

1.  **`ghost_create_tag`**
    - **Purpose**: Creates a new tag.
    - **Inputs**:
      - `name` (string, required): The name for the new tag.
      - `description` (string, optional): A description for the tag.
      - `slug` (string, optional): A URL-friendly slug (auto-generated if omitted).
    - **Output**: The created `ghost/tag` resource.

2.  **`ghost_get_tags`**
    - **Purpose**: Retrieves existing tags. Can be used to find a tag ID or check if a tag exists before creation.
    - **Inputs**:
      - `name` (string, optional): Filter tags by exact name.
    - **Output**: An array of `ghost/tag` resources matching the filter (or all tags if no name is provided).

3.  **`ghost_upload_image`**
    - **Purpose**: Uploads an image to Ghost for use, typically as a post's featured image.
    - **Inputs**:
      - `imageUrl` (string URL, required): A publicly accessible URL of the image to upload.
      - `alt` (string, optional): Alt text for the image (a default is generated if omitted).
    - **Output**: An object containing the final `url` (the Ghost URL for the uploaded image) and the determined `alt` text.
    - **Usage Note**: Call this tool first to get a Ghost image URL before creating a post that needs a featured image.

4.  **`ghost_create_post`**
    - **Purpose**: Creates a new post.
    - **Inputs**:
      - `title` (string, required): The title of the post.
      - `html` (string, required): The main content of the post in HTML format.
      - `status` (string, optional, default: 'draft'): Set status to 'draft', 'published', or 'scheduled'.
      - `tags` (array of strings, optional): List of tag _names_ to associate. Tags will be looked up or created automatically.
      - `published_at` (string ISO date, optional): Date/time to publish or schedule. Required if status is 'scheduled'.
      - `custom_excerpt` (string, optional): A short summary.
      - `feature_image` (string URL, optional): The URL of the featured image (use the `url` output from `ghost_upload_image`).
      - `feature_image_alt` (string, optional): Alt text for the feature image.
      - `feature_image_caption` (string, optional): Caption for the feature image.
      - `meta_title` (string, optional): Custom SEO title.
      - `meta_description` (string, optional): Custom SEO description.
    - **Output**: The created `ghost/post` resource.

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

# Run the MCP server with transport options
ghost-mcp

# Or with specific transport
MCP_TRANSPORT=stdio ghost-mcp
```

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
- **Tool Execution Errors:** Check the server console logs for detailed error messages from the specific tool implementation (e.g., `ghost_create_post`, `ghost_upload_image`). Common issues include invalid input (check against tool schemas in `src/mcp_server.js` and the README guide), problems downloading from `imageUrl`, image processing failures, or upstream errors from the Ghost API.
- **Command Not Found:** If `ghost-mcp-server` or `ghost-mcp` commands are not found after global installation, ensure npm's global bin directory is in your PATH. You can find it with `npm bin -g`.
- **Dependency Installation Issues:** Ensure you have a compatible Node.js version installed (Node.js 18.0.0 or higher - see Requirements section). For global installation issues, try `npm install -g @jgardner04/ghost-mcp-server --force`. For development setup, try removing `node_modules` and `package-lock.json` and running `npm install` again.
