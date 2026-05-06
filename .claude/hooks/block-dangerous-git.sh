#!/usr/bin/env bash
# PreToolUse hook for Bash. Blocks dangerous git invocations that bypass
# project safety gates: --no-verify (skips Husky lint/test) and --force on
# push (--force-with-lease is allowed because it's safe in normal usage).
#
# We shell-tokenize the command (Python shlex) and only match flags that
# appear as top-level argv tokens — substring matches inside quoted message
# bodies don't trigger the hook.
#
# Input: JSON on stdin: { tool_input: { command: "..." }, ... }
# Output: exit 0 = allow; exit 2 + stderr message = block.
#
# Bypass: GHOST_MCP_HOOK_BYPASS=1 (logged to stderr).

set -u

input="$(cat)"

if [[ "${GHOST_MCP_HOOK_BYPASS:-}" == "1" ]]; then
  echo "[hook bypass] block-dangerous-git.sh skipped via GHOST_MCP_HOOK_BYPASS=1" >&2
  exit 0
fi

result=$(HOOK_INPUT="$input" python3 - <<'PY'
import json, shlex, os, sys

raw = os.environ.get("HOOK_INPUT", "")
try:
    data = json.loads(raw) if raw else {}
except Exception:
    print("ALLOW")
    sys.exit(0)

command = data.get("tool_input", {}).get("command", "") or ""
if not command:
    print("ALLOW")
    sys.exit(0)

# Split on shell command separators so chained commands are checked too.
# Conservative: any of && || ; | starts a fresh command.
import re
segments = re.split(r"(?:&&|\|\||;|\|)", command)

def check(segment):
    seg = segment.strip()
    if not seg:
        return None
    try:
        tokens = shlex.split(seg, posix=True)
    except ValueError:
        return None  # unbalanced quotes — let it through, lint-staged will catch real issues

    if len(tokens) < 2 or tokens[0] != "git":
        return None

    sub = tokens[1]

    if sub in ("commit", "push") and "--no-verify" in tokens[2:]:
        return "NO_VERIFY"

    if sub == "push" and "--force" in tokens[2:] and not any(
        t == "--force-with-lease" or t.startswith("--force-with-lease=") for t in tokens[2:]
    ):
        return "FORCE_PUSH"

    return None

for seg in segments:
    verdict = check(seg)
    if verdict:
        print(verdict)
        sys.exit(0)

print("ALLOW")
PY
)

case "$result" in
  NO_VERIFY)
    cat >&2 <<'EOF'
Blocked: --no-verify bypasses Husky pre-commit (lint-staged) / pre-push (npm test).
Per CLAUDE.md, fix the failing lint/test instead. If absolutely necessary,
set GHOST_MCP_HOOK_BYPASS=1 and try again — the bypass is logged.
EOF
    exit 2
    ;;
  FORCE_PUSH)
    cat >&2 <<'EOF'
Blocked: `git push --force` can clobber upstream history. Use
`git push --force-with-lease` instead, which refuses the push if the remote
has moved unexpectedly. Set GHOST_MCP_HOOK_BYPASS=1 to override.
EOF
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
