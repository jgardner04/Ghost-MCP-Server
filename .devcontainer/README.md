# Development Container

This directory contains the configuration for running Ghost MCP Server in a development container.

## Quick Start

1. Install [VS Code](https://code.visualstudio.com/) and the [Remote - Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open this repository in VS Code
3. Click "Reopen in Container" when prompted (or use Command Palette: `Cmd+Shift+P` → "Dev Containers: Reopen in Container")
4. Wait for the container to build and start
5. Create a `.env` file with your Ghost CMS credentials (see below)

## Environment Variables

Create a `.env` file in the workspace root with your Ghost CMS configuration:

```bash
GHOST_ADMIN_API_URL=https://your-ghost-site.com
GHOST_ADMIN_API_KEY=your_admin_api_key
```

## Features

- **Node.js 24 LTS** with all native dependencies for sharp image processing
- **ZSH shell** with [Starship](https://starship.rs/) prompt
- **Claude Code CLI** pre-installed and ready to use
- **Git Delta** for improved diff visualization
- **Persistent history** - command history persists between container restarts
- **Pre-configured VS Code** with ESLint, Prettier, Vitest, and GitLens extensions
- **AI assistant ready** - works with Claude Code, GitHub Copilot, and other tools

## Ports

The following ports are forwarded from the container:

| Port | Service |
|------|---------|
| 3000 | Express REST API |
| 3001 | MCP Server |

## Customization

### Adding VS Code Extensions

Edit `devcontainer.json` and add extensions to the `customizations.vscode.extensions` array:

```json
{
  "customizations": {
    "vscode": {
      "extensions": [
        "your-extension-id"
      ]
    }
  }
}
```

### Modifying Build Arguments

Edit the `build.args` section in `devcontainer.json`:

```json
{
  "build": {
    "args": {
      "TZ": "Europe/London"
    }
  }
}
```

## Troubleshooting

### Container fails to start

1. Check Docker is running
2. Try rebuilding without cache: Command Palette → "Dev Containers: Rebuild Container Without Cache"

### Sharp installation fails

The Dockerfile includes `libvips-dev` for sharp. If issues persist, rebuild the container without cache.
