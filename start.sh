#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Load .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Install deps if needed
if [ ! -d node_modules ]; then
  npm install
fi

exec npx tsx src/cli.ts start
