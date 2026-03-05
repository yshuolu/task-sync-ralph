# fn-1-lark-tasksync-daemon.4 Daemon lifecycle and CLI

## Description
Build daemon lifecycle management (signals, PID file, health) and CLI commands for user control.

**Size:** M
**Files:** `src/daemon.ts`, `src/cli.ts` (extend from task 1), `src/health.ts`

## Approach

- Create daemon entry point that wires together poller, sync engine, and plan queue
  - Shutdown flag pattern: `let isShuttingDown = false`
  - Handle SIGTERM, SIGINT -> graceful shutdown (stop poller, drain queue, kill children, save state)
  - Handle SIGHUP -> reload config without restart (re-read `.tasksync/config.json` and env vars)
  - Forced exit timeout (15 seconds) after graceful shutdown initiated
  - PID file at `.tasksync/daemon.pid` — check on startup, refuse if already running
- Create health module that writes `.tasksync/health.json` after each poll cycle:
  - `{ lastPoll, nextPoll, syncedCount, pendingCount, failedCount, daemonPid, uptime }`
- Extend CLI with commands:
  - `start` — start daemon (foreground by default)
  - `stop` — send SIGTERM to PID from PID file
  - `status` — read health.json + check if PID is alive
  - `sync-once` — run a single sync cycle without starting daemon
  - `discover` — already built in task 1
- Validate config before starting daemon, fail fast with helpful error messages

## Key context

<!-- Updated by plan-sync: fn-1-lark-tasksync-daemon.1 CLI structure uses COMMANDS array and switch pattern -->
- Existing CLI in `src/cli.ts` uses a `COMMANDS` array (`["discover", "start", "stop", "status", "sync-once"] as const`), a `Command` type, and a `switch` statement in `main()`. Extend by adding case handlers (stubs for `start`/`stop`/`status`/`sync-once` already exist and print "not yet implemented")
- `loadConfig()` from `src/config.ts` accepts `{ requireTasklists?: boolean }` option -- daemon startup should call `loadConfig()` (default requires tasklist GUIDs). Config returns `TaskSyncConfig` with `lark`, `poll`, `plan` sub-objects and `flowctlPath`
- SIGHUP reload: call `loadConfig()` again to re-read `.tasksync/config.json` and env vars
- Do NOT run via `npm start` in production — npm swallows signals. Use `npx tsx src/cli.ts start` or `node dist/cli.js start` directly
- PID file must be cleaned up on both normal and abnormal exit (use `process.on('exit', ...)`)
- The forced-exit timeout (`setTimeout(...).unref()`) ensures the daemon doesn't hang on stuck cleanup
- `sync-once` mode is useful for testing and CI — same code path, just don't start the interval
## Acceptance
- [ ] Daemon starts and polls at configured interval
- [ ] SIGTERM/SIGINT trigger graceful shutdown (poller stopped, queue drained, children killed, state saved)
- [ ] SIGHUP reloads configuration without restart
- [ ] Forced exit after 15s if graceful shutdown hangs
- [ ] PID file prevents duplicate daemon instances
- [ ] PID file cleaned up on exit
- [ ] Health file updated after each poll cycle
- [ ] CLI `start`, `stop`, `status`, `sync-once` commands work
- [ ] `status` shows last poll time, synced/pending/failed counts, uptime
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
