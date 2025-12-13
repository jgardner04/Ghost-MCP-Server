# Testing Environment Setup

This document outlines how to set up a testing environment for the Ghost MCP Server, including running automated tests with Vitest, running a local Ghost CMS instance for manual testing, and testing with the MCP Inspector tool.

## Running Automated Tests

The project uses **Vitest** as the test framework. Tests are located alongside source files in `__tests__/` directories.

### Test Commands

```bash
# Run tests once
npm test

# Run tests in watch mode (recommended for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Coverage Requirements

- **Minimum**: 80% for lines, branches, functions, and statements
- Coverage is enforced in CI pipeline

### Test File Structure

```
src/
├── services/
│   ├── ghostService.js
│   └── __tests__/
│       └── ghostService.test.js
├── schemas/
│   ├── postSchemas.js
│   └── __tests__/
│       └── postSchemas.test.js
└── utils/
    ├── validation.js
    └── __tests__/
        └── validation.test.js
```

## Setting Up Ghost CMS with Podman

Podman provides a lightweight way to run containerized applications without requiring root privileges. Use the following command to start a Ghost CMS instance in development mode:

```shell
podman run -d \
  -p 2368:2368 \
  --name ghost-dev \
  -e NODE_ENV=development \
  ghost:latest \
  ghost run --development
```

Alternatively, if you prefer using Docker:

```shell
docker run -d \
  -p 2368:2368 \
  --name ghost-dev \
  -e NODE_ENV=development \
  ghost:latest \
  ghost run --development
```

This command:

- Runs Ghost in detached mode (`-d`)
- Maps port 2368 from the container to your host
- Names the container "ghost-dev" for easy reference
- Sets the NODE_ENV to development
- Uses the latest Ghost image
- Runs Ghost in development mode

Once started, you can access the Ghost admin panel at http://localhost:2368/ghost/ and set up your initial admin account.

### Managing the Ghost Container

**Using Podman:**

```shell
# Stop the Ghost container
podman stop ghost-dev

# Start an existing Ghost container
podman start ghost-dev

# View container logs
podman logs ghost-dev

# Remove the container
podman rm ghost-dev
```

**Using Docker:**

```shell
# Stop the Ghost container
docker stop ghost-dev

# Start an existing Ghost container
docker start ghost-dev

# View container logs
docker logs ghost-dev

# Remove the container
docker rm ghost-dev
```

## Obtaining Ghost Admin API Credentials

To test the MCP server integration, you'll need to obtain Ghost Admin API credentials:

1. Log in to your Ghost Admin panel (http://localhost:2368/ghost/)
2. Navigate to Settings → Integrations
3. Click "Add custom integration"
4. Name it "MCP Server Testing"
5. Copy the Admin API Key and URL

Update your `.env` file with these credentials:

```
GHOST_ADMIN_API_URL=http://localhost:2368/ghost/api/admin
GHOST_ADMIN_API_KEY=<your_admin_api_key>
```

## Testing with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a visual testing tool for MCP servers that helps debug and test your implementation.

### Installing and Running MCP Inspector

The simplest way to use MCP Inspector is with `npx`. You can test your MCP server with:

```shell
# Test the MCP server (recommended)
npx @modelcontextprotocol/inspector node src/mcp_server.js

# Or use the ghost-mcp CLI entry point
npx @modelcontextprotocol/inspector ghost-mcp
```

This will:

- Start your MCP server
- Launch an MCP Inspector client (default port 6274)
- Start an MCP Proxy server (default port 6277)

### Passing Environment Variables

If you need to pass environment variables to your MCP server:

```shell
npx @modelcontextprotocol/inspector -e GHOST_ADMIN_API_URL=http://localhost:2368/ghost/api/admin -e GHOST_ADMIN_API_KEY=<your_key> node src/mcp_server.js
```

You can also combine environment variables with your server's arguments:

```shell
npx @modelcontextprotocol/inspector -e GHOST_ADMIN_API_URL=http://localhost:2368/ghost/api/admin -- node src/mcp_server.js
```

### Custom Ports

If you need to use different ports for the Inspector:

```shell
CLIENT_PORT=8080 SERVER_PORT=9000 npx @modelcontextprotocol/inspector node src/mcp_server.js
```

### Using the Inspector UI

1. Open your browser to http://localhost:6274 (or your custom CLIENT_PORT)
2. Connect to your MCP server (running via the proxy)
3. Test various MCP functions and observe the responses
4. Use the configuration panel to adjust settings if needed

## Debugging Common Issues

### Ghost CMS Issues

- **Container won't start**: Check for port conflicts on 2368
- **Cannot access admin panel**: Ensure the container is running with `podman ps`
- **Database errors**: Ghost data persists in the container; use volumes for permanent storage

### MCP Server Issues

- **Connection refused**: Ensure your server is properly binding to the expected port
- **Authentication errors**: Verify your Ghost Admin API credentials in the .env file
- **Timeout errors**: Check the MCP_SERVER_REQUEST_TIMEOUT setting in the Inspector configuration

### MCP Inspector Issues

- **UI not loading**: Verify the Inspector client is running on the expected port
- **Cannot connect to server**: Check that your MCP server is running and the proxy port is correct
- **Authentication problems**: Enter your bearer token in the Inspector UI if your server requires it

## Continuous Integration Testing

For automated testing in CI environments, you can:

1. Use Podman in your CI pipeline to start Ghost
2. Wait for Ghost to initialize
3. Set up test admin credentials
4. Run your tests against the Ghost instance
5. Shut down the container when done

Example CI script section:

```yaml
test:
  script:
    - podman run -d -p 2368:2368 --name ghost-ci ghost:latest ghost run --development
    - sleep 10 # Wait for Ghost to initialize
    - npm test
    - podman stop ghost-ci
    - podman rm ghost-ci
```
