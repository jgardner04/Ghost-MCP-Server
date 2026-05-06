#!/usr/bin/env bash
# PreToolUse hook for Edit / Write. Refuses changes to src/mcp_server*.js
# that try to register MCP resources or resource handlers. The canonical
# server is tools-only by product decision (see CLAUDE.md, phase3 plan).
#
# Input: JSON on stdin with `tool_name` and `tool_input` (file_path, new_string
# for Edit; file_path, content for Write).
# Output: exit 0 = allow; exit 2 + stderr = block.
#
# Bypass: GHOST_MCP_HOOK_BYPASS=1 (logged to stderr).

set -u

input="$(cat)"

if [[ "${GHOST_MCP_HOOK_BYPASS:-}" == "1" ]]; then
  echo "[hook bypass] block-mcp-resources.sh skipped via GHOST_MCP_HOOK_BYPASS=1" >&2
  exit 0
fi

read -r file_path payload < <(printf '%s' "$input" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "")
    ti = data.get("tool_input", {}) or {}
    fp = ti.get("file_path", "")
    if tool == "Edit":
        payload = ti.get("new_string", "")
    elif tool == "Write":
        payload = ti.get("content", "")
    elif tool == "MultiEdit":
        edits = ti.get("edits", []) or []
        payload = "\n".join(e.get("new_string", "") for e in edits)
    else:
        payload = ""
    # Strip newlines so we can pass on a single line.
    print(fp, "\x00" + payload.replace("\n", " ").replace("\r", " "))
except Exception:
    print("")
')

# Only matters for src/mcp_server*.js
if [[ ! "$file_path" =~ src/mcp_server.*\.js$ ]]; then
  exit 0
fi

# Strip the null sentinel
payload="${payload#$'\x00'}"

# Match resource registration calls.
if [[ "$payload" =~ (server|mcp)\.resource\( ]] \
  || [[ "$payload" =~ registerResource\( ]] \
  || [[ "$payload" =~ setResourceHandler\( ]] \
  || [[ "$payload" =~ ListResourcesRequestSchema ]] \
  || [[ "$payload" =~ ReadResourceRequestSchema ]]; then
  cat >&2 <<EOF
Blocked: $file_path appears to register an MCP resource or resource handler.
The canonical Ghost MCP server is tools-only by design (CLAUDE.md, phase3 plan).
Resource support belongs in the experimental enhanced server, not the
canonical one. Set GHOST_MCP_HOOK_BYPASS=1 if this is intentional.
EOF
  exit 2
fi

exit 0
