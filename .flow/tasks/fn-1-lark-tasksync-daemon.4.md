# fn-1-lark-tasksync-daemon.4 Daemon lifecycle and CLI

## Description
Build daemon lifecycle management (signals, PID file, health) and CLI commands for user control.

**Size:** M
**Files:** `src/daemon.ts`, `src/cli.ts` (extend from task 1), `src/health.ts`

## Approach

<!-- Updated by plan-sync: fn-1-lark-tasksync-daemon.3 — Poller already wires sync engine + PlanQueue internally -->
- Create daemon entry point that instantiates `Poller` (from `src/sync/poller.ts`). The `Poller` constructor already wires together the sync engine (differ), `PlanQueue`, `StateStore`, `LarkClient`, and `FlowctlClient` internally — the daemon does NOT need to separately create these components. Just pass `TaskSyncConfig` (from `loadConfig()`) and optionally a `statePath` to `new Poller(config, statePath)`, then call `poller.start()`.
  - Shutdown flag pattern: `let isShuttingDown = false`
  - Handle SIGTERM, SIGINT -> graceful shutdown: call `await poller.stop()` which internally calls `planQueue.shutdown()` (clears queue + kills all active claude child processes via `bridge.killAll()`). Then optionally call `await poller.getStateStore().save()` to persist final state.
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
<!-- Updated by plan-sync: fn-1-lark-tasksync-daemon.3 — Poller/PlanQueue API details -->
- `Poller` (from `src/sync/poller.ts`) is the top-level orchestrator: `new Poller(config: TaskSyncConfig, statePath?: string)`. It internally creates `LarkClient`, `FlowctlClient`, `StateStore`, and `PlanQueue`. Key methods: `start()`, `async stop()`, `getStateStore(): StateStore`, `getPlanQueue(): PlanQueue`
- `PlanQueue` (from `src/planner/queue.ts`) manages concurrent `claude -p` invocations. Key methods: `enqueue(job: PlanJob)`, `async shutdown()`, `getActiveProcessCount()`, plus getters `size`, `pending`, `idle`, `async onIdle()`
- For health stats, use `poller.getStateStore().getState()` to read `SyncState.tasks` (a `Record<string, SyncedTaskEntry>`) and count entries by `syncStatus` ("synced" | "pending_plan" | "failed" | "skipped"). Use `poller.getPlanQueue().size` / `.pending` for queue info
- `sync-once` can be implemented by calling `poller.start()` then waiting for one tick to complete and calling `poller.stop()` — or by directly reusing the internal tick logic
- Do NOT run via `npm start` in production — npm swallows signals. Use `npx tsx src/cli.ts start` or `node dist/cli.js start` directly
- PID file must be cleaned up on both normal and abnormal exit (use `process.on('exit', ...)`)
- The forced-exit timeout (`setTimeout(...).unref()`) ensures the daemon doesn't hang on stuck cleanup
- `sync-once` mode is useful for testing and CI — same code path, just don't start the interval
## Acceptance
- [ ] Daemon starts and polls at configured interval
- [ ] SIGTERM/SIGINT trigger graceful shutdown (calls `poller.stop()` which stops polling, clears queue, and kills active claude child processes, then saves final state)
- [ ] SIGHUP reloads configuration without restart
- [ ] Forced exit after 15s if graceful shutdown hangs
- [ ] PID file prevents duplicate daemon instances
- [ ] PID file cleaned up on exit
- [ ] Health file updated after each poll cycle
- [ ] CLI `start`, `stop`, `status`, `sync-once` commands work
- [ ] `status` shows last poll time, synced/pending/failed counts, uptime
## Done summary
Implemented daemon lifecycle management and CLI commands:

- **src/daemon.ts**: Daemon class with PID file management, SIGTERM/SIGINT graceful shutdown (with 15s forced exit timeout), SIGHUP config reload, and health file updates after each poll cycle
- **src/health.ts**: Health module that writes/reads `.tasksync/health.json` with lastPoll, nextPoll, synced/pending/failed counts, PID, and uptime
- **src/cli.ts**: Extended with `start` (foreground daemon), `stop` (SIGTERM to PID), `status` (health + PID check), and `sync-once` (single cycle) commands
- **src/sync/poller.ts**: Added `onTickComplete` callback for health integration
## Evidence
- Commits:
- Tests:
- PRs: