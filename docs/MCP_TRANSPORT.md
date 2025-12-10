# MCP Server Transport Configuration

The improved MCP server implementation supports multiple transport layers to accommodate different client types and use cases.

## Transport Options

### 1. Standard I/O (stdio)

Best for CLI tools and direct process communication.

```bash
npm run start:mcp:stdio
# or
MCP_TRANSPORT=stdio npm run start:mcp
```

**Use Cases:**

- CLI tools that spawn the MCP server as a subprocess
- Direct integration with shell scripts
- Testing and debugging with simple text protocols

**Example Client Connection:**

```javascript
import { spawn } from 'child_process';
const mcpProcess = spawn('npm', ['run', 'start:mcp:stdio']);
// Communicate via stdin/stdout
```

### 2. HTTP with Server-Sent Events (SSE)

Good for web clients and RESTful integrations.

```bash
npm run start:mcp:http
# or
MCP_TRANSPORT=http npm run start:mcp
```

**Use Cases:**

- Web applications
- Cross-origin requests (CORS supported)
- Stateless client connections
- Integration with existing HTTP infrastructure

**Endpoints:**

- SSE Stream: `http://localhost:3001/mcp/sse`
- Health Check: `http://localhost:3001/mcp/health`

**Example Client Connection:**

```javascript
const eventSource = new EventSource('http://localhost:3001/mcp/sse');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### 3. WebSocket

Best for real-time bidirectional communication.

```bash
npm run start:mcp:websocket
# or
MCP_TRANSPORT=websocket npm run start:mcp
```

**Use Cases:**

- Real-time applications
- Persistent connections
- Low-latency communication
- Bidirectional streaming

**Example Client Connection:**

```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.on('open', () => {
  ws.send(JSON.stringify({ method: 'list_tools' }));
});
ws.on('message', (data) => {
  console.log('Received:', JSON.parse(data));
});
```

## Configuration

Configure transport settings via environment variables:

```env
# Transport type: stdio, http, sse, websocket
MCP_TRANSPORT=http

# Port for network transports (default: 3001)
MCP_PORT=3001

# CORS configuration for HTTP/SSE
MCP_CORS=*

# SSE endpoint path
MCP_SSE_ENDPOINT=/mcp/sse

# WebSocket path
MCP_WS_PATH=/

# WebSocket heartbeat interval (ms)
MCP_WS_HEARTBEAT=30000

# Allowed origins (comma-separated)
MCP_ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com
```

## Error Handling

All transports now return standardized error responses:

```json
{
  "error": {
    "code": "TOOL_EXECUTION_ERROR",
    "message": "Failed to create post",
    "tool": "ghost_create_post",
    "details": {
      "originalError": "Validation failed"
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

Error codes:

- `TOOL_EXECUTION_ERROR`: General tool execution failure
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `IMAGE_UPLOAD_ERROR`: Image processing/upload failed
- `VALIDATION_ERROR`: Input validation failed
- `GHOST_API_ERROR`: Ghost API returned an error
- `UNKNOWN_ERROR`: Unexpected error

## Resource Fetching

Resources now support fetching individual items:

```javascript
// Fetch a specific tag
GET / resources / ghost / tag / my - tag - slug;

// Fetch a specific post (when implemented)
GET / resources / ghost / post / post - id;
```

## Security Considerations

### API Key Authentication (Optional)

Enable API key authentication:

```env
MCP_API_KEY=your-secret-key
```

Clients must include the API key in requests:

- **HTTP/SSE**: `Authorization: Bearer your-secret-key`
- **WebSocket**: Send in connection params or first message
- **stdio**: Not applicable

### CORS Configuration

For HTTP/SSE transport, configure CORS:

```env
# Allow all origins (development)
MCP_CORS=*

# Restrict to specific origins (production)
MCP_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

## Choosing the Right Transport

| Transport     | Best For            | Pros                                       | Cons                       |
| ------------- | ------------------- | ------------------------------------------ | -------------------------- |
| **stdio**     | CLI tools, scripts  | Simple, secure, no network                 | Limited to local processes |
| **HTTP/SSE**  | Web apps, REST APIs | CORS support, stateless, firewall-friendly | One-way streaming only     |
| **WebSocket** | Real-time apps      | Bidirectional, low latency, persistent     | More complex, stateful     |

## Migration from Basic Implementation

The improved implementation is backward compatible. To migrate:

1. Replace `src/mcp_server.js` imports with `src/mcp_server_improved.js`
2. Update startup code to use `startMCPServer(transport, options)`
3. Configure transport via environment variables
4. Update client code to handle standardized error responses

## Testing Different Transports

Test each transport with curl or similar tools:

### HTTP/SSE

```bash
# Health check
curl http://localhost:3001/mcp/health

# SSE stream (will stay open)
curl -N http://localhost:3001/mcp/sse
```

### WebSocket

```bash
# Using wscat (npm install -g wscat)
wscat -c ws://localhost:3001
```

### stdio

```bash
# Direct execution
MCP_TRANSPORT=stdio node src/mcp_server_improved.js
# Then type JSON-RPC commands directly
```
