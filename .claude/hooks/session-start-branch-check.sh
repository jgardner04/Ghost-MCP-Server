#!/usr/bin/env bash
# SessionStart hook: warn Claude when the current branch is `main`.
#
# Branch protection on `main` rejects commits server-side, and the
# stash/checkout dance after a rejected commit wastes tokens. Catching
# the situation at session start is the cheapest possible moment.
#
# Output: JSON envelope per Claude Code SessionStart hook schema
# (https://code.claude.com/docs/en/hooks.md). `additionalContext` is
# injected into Claude's startup context.
#
# Exit codes: 0 always — this hook is informational, never blocking.

set -u

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

if [[ "$branch" != "main" ]]; then
  printf '{"continue":true}\n'
  exit 0
fi

read -r -d '' context <<'EOF' || true
You are currently on the `main` branch.

Branch protection is enabled on `main`, so direct commits will be rejected by the server. Per CLAUDE.md, all work must happen on a feature branch named `<type>/issue-NN-<description>` (types: feature, fix, docs, refactor, test).

Before any Edit, Write, or Bash that mutates files in this repo:
1. Confirm the work scope with the user (or infer it from their request).
2. Run `git checkout -b <type>/<short-description>` to move off `main`.
3. Then proceed with edits.

If the user only asked you to read or explore, no branch is needed.
EOF

# Emit JSON. Use python for safe string escaping.
python3 - "$context" <<'PY'
import json, sys
print(json.dumps({
    "continue": True,
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": sys.argv[1],
    },
}))
PY

exit 0
