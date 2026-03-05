#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# If no .env, prompt for secrets and create it
if [ ! -f .env ]; then
  echo "No .env file found. Let's set up your Lark credentials."
  echo ""

  read -rp "LARK_APP_ID: " lark_app_id
  read -rp "LARK_APP_SECRET: " lark_app_secret
  read -rp "LARK_TASKLIST_GUIDS (comma-separated): " lark_tasklist_guids

  cat > .env <<EOF
LARK_APP_ID=${lark_app_id}
LARK_APP_SECRET=${lark_app_secret}
LARK_TASKLIST_GUIDS=${lark_tasklist_guids}
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

exec npx tsx src/cli.ts start
