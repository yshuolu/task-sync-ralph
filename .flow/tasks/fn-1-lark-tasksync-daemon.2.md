# fn-1-lark-tasksync-daemon.2 Sync engine and state management

## Description
Build the core sync engine that polls Lark, diffs against local state, and creates flow-next epics for new tasks.

**Size:** M
**Files:** `src/sync/poller.ts`, `src/sync/differ.ts`, `src/sync/types.ts`, `src/state/store.ts`, `src/state/types.ts`, `src/flowctl/client.ts`

## Approach

- Create a flowctl client module that shells out to `.flow/bin/flowctl` with `--json` and parses responses
  - `epicCreate(title: string)`: returns epic ID
  - `epicsList()`: returns array of existing epics
  - Key convention: all flowctl JSON responses follow `{ success: boolean, ... }` pattern (ref: `.flow/bin/flowctl.py:368-380`)
- Create state store with atomic read/write using `write-file-atomic`
  - State lives at `.tasksync/state.json` (outside `.flow/` to avoid git tracking conflicts)
  - Use `proper-lockfile` to prevent concurrent writes from multiple daemon instances
  - Implement the sync state schema from the epic spec (version, last_poll, tasks map)
- Create diff engine that compares Lark task GUIDs against state entries
  - New task = GUID not in state OR state entry has `sync_status: failed` with `failure_count < maxRetries`
  - Already synced = GUID in state with `sync_status: synced`
- Create poller with drift-protected interval (calculate next tick, don't rely on raw setInterval)
  - On each tick: fetch all tasks from configured tasklists -> diff -> create epics -> update state
  - Exponential backoff on API errors (5 min -> 10 min -> 20 min -> cap at 60 min), reset on success

## Key context

<!-- Updated by plan-sync: fn-1-lark-tasksync-daemon.1 used LarkClient class, not standalone functions -->
- Lark client is a **class** `LarkClient` imported from `src/lark/client.ts`. Instantiate with `new LarkClient(config.lark)` (takes `LarkConfig`, not full `TaskSyncConfig`)
- Use `client.fetchAllTasks()` which returns `Map<string, LarkTask[]>` (map from tasklist GUID to tasks) -- pagination is handled internally
- Use `client.fetchTasks(tasklistGuid)` for single-tasklist fetch -- also handles pagination internally
- Types `LarkTask`, `LarkTasklist`, `LarkMember`, `LarkTimestamp` are exported from `src/lark/types.ts`
- `loadConfig()` from `src/config.ts` returns `TaskSyncConfig` with sub-objects: `lark` (`LarkConfig`), `poll` (`PollConfig`), `plan` (`PlanConfig`), and `flowctlPath` (string)
- Use `config.flowctlPath` for the flowctl binary path (defaults to `.flow/bin/flowctl`, overridable via `FLOWCTL_PATH` env var or config file)
- `flowctl epic create` uses scan-based ID allocation, so concurrent creation from multiple processes is safe (ref: `.flow/bin/flowctl.py:2704-2768`)
- State file must survive daemon restarts — always persist after each sync cycle
- Use `write-file-atomic` (writes to temp file then renames, atomic on Unix) — NOT `fs.writeFileSync`
- PID file check prevents duplicate daemon instances from racing on state
## Acceptance
- [ ] flowctl client module creates epics and lists existing epics via shell execution
- [ ] State store reads/writes `.tasksync/state.json` atomically
- [ ] Lockfile prevents concurrent state access
- [ ] Differ correctly identifies new vs already-synced Lark tasks
- [ ] Poller runs at configured interval with drift protection
- [ ] Exponential backoff on Lark API errors
- [ ] State persisted after each sync cycle
- [ ] No duplicate epics created for the same Lark task across restarts
## Done summary
## Summary

Implemented the core sync engine and state management for TaskSync:

1. **flowctl client** (`src/flowctl/client.ts`): Shells out to flowctl binary with `--json` flag. Supports `epicCreate(title)` and `epicsList()`.

2. **State store** (`src/state/store.ts`, `src/state/types.ts`): Atomic read/write of `.tasksync/state.json` using `write-file-atomic`. Uses `proper-lockfile` to prevent concurrent access. Tracks sync status per Lark task GUID (synced/failed with failure counts).

3. **Diff engine** (`src/sync/differ.ts`, `src/sync/types.ts`): Compares Lark task GUIDs against state entries. Identifies new tasks, retryable failures (below maxRetries), already-synced, and permanently failed tasks.

4. **Poller** (`src/sync/poller.ts`): Drift-protected polling using absolute-time scheduling (setTimeout, not setInterval). Exponential backoff on API errors (5min -> 10min -> 20min -> cap 60min), resets on success. Each cycle: fetch all tasks -> diff -> create epics -> update state. State persisted after each sync cycle.

All code typechecks cleanly with `tsc --noEmit`.
## Evidence
- Commits:
- Tests:
- PRs: