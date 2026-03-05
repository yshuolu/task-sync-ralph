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
TBD

## Evidence
- Commits:
- Tests:
- PRs:
