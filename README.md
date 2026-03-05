# TaskSync

A Node.js daemon that bridges Lark (ByteDance) task management with [flow-next](https://github.com/gmickel/gmickel-claude-marketplace/tree/main/plugins/flow-next) epic planning. It polls configured Lark tasklists, creates flow-next epics for new tasks, and triggers `claude -p` to auto-generate plans.

## Prerequisites

- **Node.js** v22 or later
- **Lark app** with `task:tasklist:read` scope (created in the [Lark Developer Console](https://open.larksuite.com/app))
- **flow-next** plugin installed (provides `.flow/bin/flowctl`)
- **Claude CLI** installed and in PATH (for automatic planning)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

3. Discover available Lark tasklists to find their GUIDs:

   ```bash
   npx tsx src/cli.ts discover
   ```

4. Set `LARK_TASKLIST_GUIDS` in your `.env` file with the GUIDs you want to sync.

## Configuration

Configuration is layered: environment variables > `.tasksync/config.json` > defaults.

| Key | Env Var | Default | Description |
|-----|---------|---------|-------------|
| `lark.appId` | `LARK_APP_ID` | *required* | Lark app ID |
| `lark.appSecret` | `LARK_APP_SECRET` | *required* | Lark app secret |
| `lark.domain` | `LARK_DOMAIN` | `lark` | `lark` (international) or `feishu` (China) |
| `lark.tasklistGuids` | `LARK_TASKLIST_GUIDS` | *required* | Comma-separated tasklist GUIDs |
| `poll.intervalMs` | `TASKSYNC_POLL_INTERVAL_MS` | `300000` | Poll interval in ms (5 min) |
| `plan.concurrency` | `TASKSYNC_PLAN_CONCURRENCY` | `1` | Max parallel `claude -p` invocations |
| `plan.timeoutMs` | `TASKSYNC_PLAN_TIMEOUT_MS` | `1800000` | Per-plan timeout in ms (30 min) |
| `plan.maxRetries` | `TASKSYNC_PLAN_MAX_RETRIES` | `3` | Max retries before skipping a task |
| `plan.claudeArgs` | `TASKSYNC_CLAUDE_ARGS` | `""` | Extra args passed to `claude -p` |
| `flowctl.path` | `FLOWCTL_PATH` | `.flow/bin/flowctl` | Path to flowctl binary |

You can also set `TASKSYNC_SKIP_PERMISSIONS=true` to add `--dangerously-skip-permissions` to `claude -p` calls (useful for fully autonomous operation).

## CLI Usage

```bash
# Start the daemon (foreground)
npx tsx src/cli.ts start

# Check daemon status (PID, health, sync counts)
npx tsx src/cli.ts status

# Stop the daemon (sends SIGTERM for graceful shutdown)
npx tsx src/cli.ts stop

# Discover available Lark tasklists and their GUIDs
npx tsx src/cli.ts discover

# Run a single sync cycle without starting the daemon
npx tsx src/cli.ts sync-once
```

npm scripts are also available: `npm run start`, `npm run stop`, `npm run status`, `npm run discover`, `npm run sync-once`.

## How Sync Works

1. **Poll** — The daemon polls Lark tasklists at the configured interval
2. **Diff** — Fetched task GUIDs are compared against `.tasksync/state.json`
3. **Create Epic** — New tasks get a flow-next epic via `flowctl epic create`
4. **Queue Plan** — The epic ID is enqueued in a concurrency-limited plan queue
5. **Plan** — `claude -p "/flow-next:plan <epic-id>"` is spawned headlessly
6. **Update State** — On success the entry is marked `synced`; on failure `failureCount` increments

State persists in `.tasksync/state.json` (separate from `.flow/` to avoid git conflicts). The daemon resumes from its last state on restart.

### Signal Handling

- **SIGTERM / SIGINT** — Graceful shutdown: stops polling, drains the plan queue, kills active `claude` processes, saves state
- **SIGHUP** — Reloads configuration from env vars and config file

## Troubleshooting

**"No tasklists found" during discover**
- Ensure the Lark app has `task:tasklist:read` scope enabled
- Verify credentials are correct in `.env`

**"Missing required config: LARK_TASKLIST_GUIDS"**
- Run `npx tsx src/cli.ts discover` to find GUIDs, then set `LARK_TASKLIST_GUIDS` in `.env`

**"Daemon already running"**
- Another instance is active. Run `npx tsx src/cli.ts stop` first
- If the process died without cleanup, delete `.tasksync/daemon.pid` manually

**Plans keep failing**
- Check that `claude` CLI is installed and in PATH
- Review stderr output in daemon logs for specific errors
- Tasks are retried up to `TASKSYNC_PLAN_MAX_RETRIES` times before being skipped

**Log locations**
- Daemon logs go to stdout/stderr (redirect with `> tasksync.log 2>&1` if needed)
- Health data: `.tasksync/health.json`
- Sync state: `.tasksync/state.json`
- PID file: `.tasksync/daemon.pid`

## Testing

```bash
npm test
```

Tests use Node.js built-in test runner (`node:test`) with mocked Lark API and Claude CLI.
