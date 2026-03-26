# MCP Client Setup Guide

This guide explains how to configure different MCP clients to connect to the Ghost MCP Server.

## Quick Reference

| Client                            | Configuration Method                         | Transport                |
| --------------------------------- | -------------------------------------------- | ------------------------ |
| [Claude Code](#claude-code)       | `.mcp.json` project file or `claude mcp add` | stdio                    |
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json`                 | stdio                    |
| [Cursor](#cursor)                 | Cursor MCP settings                          | stdio                    |
| [Custom clients](#custom-clients) | Manual configuration                         | stdio / HTTP / WebSocket |

---

## Claude Code

Claude Code supports project-level MCP server configuration via a `.mcp.json` file placed at the root of any project (for example, the [Sidedoc repository](https://github.com/jgardner04/sidedoc)).

### Option 1: Project `.mcp.json` file (Recommended)

Create a `.mcp.json` file in the root of your project:

```json
{
  "mcpServers": {
    "ghost": {
      "command": "npx",
      "args": ["-y", "@jgardner04/ghost-mcp-server"],
      "env": {
        "GHOST_ADMIN_API_URL": "https://your-ghost-site.com",
        "GHOST_ADMIN_API_KEY": "your_admin_api_key"
      }
    }
  }
}
```

Replace `GHOST_ADMIN_API_URL` and `GHOST_ADMIN_API_KEY` with your actual Ghost Admin API credentials (found under **Ghost Admin → Settings → Integrations → Custom Integrations**).

> **Note:** Do not commit `.mcp.json` files that contain real API keys. Add `.mcp.json` to `.gitignore`, or use environment variables sourced from a `.env` file instead.

### Option 2: `claude mcp add` command

You can also register the server via the Claude Code CLI, scoped to a specific project or your user account:

```bash
# Add for a specific project (run from project root)
claude mcp add ghost \
  --command npx \
  --args "-y @jgardner04/ghost-mcp-server" \
  --env GHOST_ADMIN_API_URL=https://your-ghost-site.com \
  --env GHOST_ADMIN_API_KEY=your_admin_api_key

# Or add at user scope (available in all projects)
claude mcp add ghost \
  --scope user \
  --command npx \
  --args "-y @jgardner04/ghost-mcp-server" \
  --env GHOST_ADMIN_API_URL=https://your-ghost-site.com \
  --env GHOST_ADMIN_API_KEY=your_admin_api_key
```

### Connecting from the Sidedoc Repository

If you use Claude Code while working on the [Sidedoc](https://github.com/jgardner04/sidedoc) project and want access to the Ghost MCP tools, add the `.mcp.json` file described above to the root of the Sidedoc repository. Claude Code will automatically detect it and make all 34 Ghost MCP tools available in that project context.

Example workflow after configuration:

```
You: ghost_get_posts
Claude: [fetches posts from your Ghost CMS using ghost_get_posts tool]

You: ghost_create_post with my new article content
Claude: [creates a draft post using ghost_create_post tool]
```

---

## Claude Desktop

Configure the Ghost MCP Server in Claude Desktop's configuration file.

### Configuration file location

| Platform | Path                                                              |
| -------- | ----------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows  | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| Linux    | `~/.config/Claude/claude_desktop_config.json`                     |

### Configuration

Open the configuration file and add a `mcpServers` entry:

```json
{
  "mcpServers": {
    "ghost": {
      "command": "npx",
      "args": ["-y", "@jgardner04/ghost-mcp-server"],
      "env": {
        "GHOST_ADMIN_API_URL": "https://your-ghost-site.com",
        "GHOST_ADMIN_API_KEY": "your_admin_api_key"
      }
    }
  }
}
```

If you have the package installed globally instead of using `npx`:

```json
{
  "mcpServers": {
    "ghost": {
      "command": "ghost-mcp",
      "env": {
        "GHOST_ADMIN_API_URL": "https://your-ghost-site.com",
        "GHOST_ADMIN_API_KEY": "your_admin_api_key"
      }
    }
  }
}
```

Restart Claude Desktop after saving the configuration file. The Ghost tools will appear in the tool panel on the next launch.

---

## Cursor

### Via Cursor Settings UI

1. Open **Cursor Settings** → **Features** → **MCP Servers**
2. Click **Add Server**
3. Enter the following details:
   - **Name:** `ghost`
   - **Command:** `npx -y @jgardner04/ghost-mcp-server`
   - **Environment Variables:**
     - `GHOST_ADMIN_API_URL` = `https://your-ghost-site.com`
     - `GHOST_ADMIN_API_KEY` = `your_admin_api_key`
4. Save and restart Cursor

### Via `cursor.mcp.json`

Alternatively, create a `cursor.mcp.json` file in the root of your project:

```json
{
  "mcpServers": {
    "ghost": {
      "command": "npx",
      "args": ["-y", "@jgardner04/ghost-mcp-server"],
      "env": {
        "GHOST_ADMIN_API_URL": "https://your-ghost-site.com",
        "GHOST_ADMIN_API_KEY": "your_admin_api_key"
      }
    }
  }
}
```

---

## Custom Clients

The Ghost MCP Server supports three transport types for custom integrations.

### stdio (Default)

Launch the server as a subprocess and communicate over stdin/stdout using JSON-RPC:

```javascript
import { spawn } from 'child_process';

const server = spawn('npx', ['-y', '@jgardner04/ghost-mcp-server'], {
  env: {
    ...process.env,
    GHOST_ADMIN_API_URL: 'https://your-ghost-site.com',
    GHOST_ADMIN_API_KEY: 'your_admin_api_key',
  },
});

// Write JSON-RPC requests to server.stdin
// Read JSON-RPC responses from server.stdout
```

### HTTP / Server-Sent Events

Start the server with HTTP transport and connect via SSE:

```bash
MCP_TRANSPORT=http GHOST_ADMIN_API_URL=https://your-ghost-site.com \
  GHOST_ADMIN_API_KEY=your_admin_api_key ghost-mcp
```

Connect from a client:

```javascript
const eventSource = new EventSource('http://localhost:3001/mcp/sse');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### WebSocket

Start the server with WebSocket transport:

```bash
MCP_TRANSPORT=websocket GHOST_ADMIN_API_URL=https://your-ghost-site.com \
  GHOST_ADMIN_API_KEY=your_admin_api_key ghost-mcp
```

Connect from a client:

```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.on('open', () => ws.send(JSON.stringify({ method: 'list_tools' })));
ws.on('message', (data) => console.log('Received:', JSON.parse(data)));
```

See [MCP_TRANSPORT.md](MCP_TRANSPORT.md) for a full description of transport options and advanced configuration.

---

## Security Notes

- **Never commit API keys.** Store credentials in environment variables or a `.env` file excluded from version control.
- For HTTP and WebSocket transports, configure `MCP_API_KEY` and `MCP_ALLOWED_ORIGINS` to restrict access in production environments.
- See [MCP_TRANSPORT.md](MCP_TRANSPORT.md#security-considerations) for details on API key authentication and CORS configuration.

---

## Troubleshooting

| Problem                            | Solution                                                          |
| ---------------------------------- | ----------------------------------------------------------------- |
| Tools not appearing in Claude Code | Verify `.mcp.json` is at the project root and is valid JSON       |
| Authentication error               | Check `GHOST_ADMIN_API_URL` and `GHOST_ADMIN_API_KEY` are correct |
| `npx` command not found            | Ensure Node.js ≥ 18 and npm are installed and in PATH             |
| `ghost-mcp` command not found      | Run `npm install -g @jgardner04/ghost-mcp-server`                 |
| Connection refused (HTTP/WS)       | Confirm `MCP_PORT` (default 3001) is not blocked by a firewall    |
