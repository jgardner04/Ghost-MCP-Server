#!/usr/bin/env bash
# PreToolUse hook for Edit / Write / Bash that mutates the working tree.
# Refuses edits while HEAD is `main`. The SessionStart hook H0 already warns
# at startup; this is the safety net so a forgotten warning becomes a hard stop
# rather than a lost commit.
#
# Input: JSON on stdin with `tool_name` and `tool_input`.
# Output: exit 0 = allow; exit 2 + stderr = block.
#
# Bypass: GHOST_MCP_HOOK_BYPASS=1 (logged to stderr).

set -u

input="$(cat)"

if [[ "${GHOST_MCP_HOOK_BYPASS:-}" == "1" ]]; then
  echo "[hook bypass] block-main-branch-edits.sh skipped via GHOST_MCP_HOOK_BYPASS=1" >&2
  exit 0
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

if [[ "$branch" != "main" ]]; then
  exit 0
fi

# Only block Bash that's a write command (commit, push). Reads (status, log,
# diff, branch lookup) are still useful on main.
tool_name=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("tool_name", ""))
except Exception:
    print("")
')

if [[ "$tool_name" == "Bash" ]]; then
  command=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    print("")
')
  # Allow read-only git operations and the branch-creating one.
  if [[ "$command" =~ git[[:space:]]+(commit|push|merge|rebase) ]]; then
    cat >&2 <<EOF
Blocked: HEAD is on \`main\` and \`$command\` would mutate \`main\`.
CLAUDE.md requires a feature branch:
  git checkout -b <type>/<short-description>
Then retry. Set GHOST_MCP_HOOK_BYPASS=1 to override.
EOF
    exit 2
  fi
  exit 0
fi

# Edit / Write tools: always blocked on main.
cat >&2 <<EOF
Blocked: HEAD is on \`main\`. CLAUDE.md requires a feature branch before any
file modification:
  git checkout -b <type>/<short-description>
Then retry the edit. Set GHOST_MCP_HOOK_BYPASS=1 to override.
EOF
exit 2
