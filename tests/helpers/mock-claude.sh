#!/bin/bash
# Mock claude CLI for integration tests.
# Reads MOCK_CLAUDE_BEHAVIOR env var to determine behavior:
#   "success" (default) — exit 0 with JSON output
#   "fail"              — exit 1 with error
#   "hang"              — sleep indefinitely (for shutdown tests)

BEHAVIOR="${MOCK_CLAUDE_BEHAVIOR:-success}"

case "$BEHAVIOR" in
  success)
    echo '{"result":"plan completed successfully"}'
    exit 0
    ;;
  fail)
    echo "Error: planning failed" >&2
    exit 1
    ;;
  hang)
    # Sleep until killed (for graceful shutdown testing)
    sleep 3600
    ;;
  *)
    echo '{"result":"plan completed successfully"}'
    exit 0
    ;;
esac
