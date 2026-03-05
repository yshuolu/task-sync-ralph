## Summary

Implemented the core sync engine and state management for TaskSync:

1. **flowctl client** (`src/flowctl/client.ts`): Shells out to flowctl binary with `--json` flag. Supports `epicCreate(title)` and `epicsList()`.

2. **State store** (`src/state/store.ts`, `src/state/types.ts`): Atomic read/write of `.tasksync/state.json` using `write-file-atomic`. Uses `proper-lockfile` to prevent concurrent access. Tracks sync status per Lark task GUID (synced/failed with failure counts).

3. **Diff engine** (`src/sync/differ.ts`, `src/sync/types.ts`): Compares Lark task GUIDs against state entries. Identifies new tasks, retryable failures (below maxRetries), already-synced, and permanently failed tasks.

4. **Poller** (`src/sync/poller.ts`): Drift-protected polling using absolute-time scheduling (setTimeout, not setInterval). Exponential backoff on API errors (5min -> 10min -> 20min -> cap 60min), resets on success. Each cycle: fetch all tasks -> diff -> create epics -> update state. State persisted after each sync cycle.

All code typechecks cleanly with `tsc --noEmit`.
