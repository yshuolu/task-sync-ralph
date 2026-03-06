#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# If no .env, prompt for secrets and create it
if [ ! -f .env ]; then
  echo "No .env file found. Let's set up your Lark credentials."
  echo ""

  read -rp "LARK_APP_ID: " lark_app_id
  read -rp "LARK_APP_SECRET: " lark_app_secret

  cat > .env <<EOF
LARK_APP_ID=${lark_app_id}
LARK_APP_SECRET=${lark_app_secret}
EOF

  echo ""
  echo ".env created."
fi

# Load .env
set -a
source .env
set +a

# Install deps if needed
if [ ! -d node_modules ]; then
  npm install
fi

# If no tasklist GUIDs configured, discover and use all
if [ -z "${LARK_TASKLIST_GUIDS:-}" ]; then
  echo "No LARK_TASKLIST_GUIDS set. Discovering all tasklists..."
  echo ""

  guids=$(npx tsx src/cli.ts discover --guids-only 2>/dev/null)

  if [ -z "$guids" ]; then
    echo "Error: No tasklists found. Check your Lark app permissions."
    exit 1
  fi

  echo "Found tasklists: $guids"
  export LARK_TASKLIST_GUIDS="$guids"
fi

exec npx tsx src/cli.ts start
