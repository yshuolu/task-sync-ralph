# fn-1-lark-tasksync-daemon.5 Documentation and integration testing

## Description
Create project documentation (README, CLAUDE.md project section) and integration tests demonstrating a full sync cycle.

**Size:** M
**Files:** `README.md`, `CLAUDE.md` (add project section), `tests/sync.test.ts`, `tests/helpers/mock-lark.ts`, `tests/helpers/mock-claude.ts`

## Approach

- Create README.md covering:
  - What tasksync is (one-sentence)
  - Prerequisites (Node.js v22, Lark app credentials, flow-next plugin)
  - Installation and setup steps
  - Configuration reference (all env vars and config keys)
  - CLI usage (start, stop, status, discover, sync-once)
  - How sync works (architecture diagram reference)
  - Troubleshooting (common errors, log locations)
- Add project-specific section to CLAUDE.md (above the flow-next block):
  - Architecture overview, key modules, Lark API notes
  - Test commands, file conventions
- Create integration tests with mocked Lark API and mocked Claude CLI:
  - Mock Lark: return configurable task lists from `tasklist.tasks` endpoint
  - Mock Claude: stub `claude -p` with a script that creates a plan file
  - Test scenarios:
    - Full sync: 3 new Lark tasks -> 3 epics created -> 3 plans triggered
    - Idempotent re-sync: same tasks -> no new epics
    - Partial failure: 1 plan fails -> retry on next cycle
    - Graceful shutdown during planning
- Use Node.js built-in test runner (`node:test`) or vitest

## Key context

- CLAUDE.md uses `<!-- BEGIN FLOW-NEXT -->` markers for the flow-next section — add project content above this block
- Integration tests should use the actual `flowctl` binary for epic operations (not mock it) to validate the real integration
- Mock the Lark SDK at the HTTP level or use the SDK's test utilities
- Mock `claude -p` by putting a stub script on PATH that mimics the expected `--output-format json` response
<!-- Updated by plan-sync: fn-1-lark-tasksync-daemon.3 — planner architecture details for testing -->
- `ClaudeBridge` (from `src/planner/bridge.ts`) spawns `claude -p` with args: `-p <prompt> --output-format json --max-turns 50` (plus optional `--dangerously-skip-permissions`). The mock stub script should accept these flags and output valid JSON (`{ "result": "..." }`) to stdout with exit code 0 for success, or non-zero exit code for failure
- `PlanQueue` (from `src/planner/queue.ts`) uses `p-queue` with configurable concurrency. It updates `SyncedTaskEntry.syncStatus` in `StateStore`: to `"synced"` on success, `"failed"` on failure (with `failureCount` incremented). Tasks with `failureCount >= maxRetries` are silently skipped (no further processing)
- The `Poller` (from `src/sync/poller.ts`) is the top-level entry point for integration tests — it orchestrates LarkClient, FlowctlClient, StateStore, and PlanQueue. Use `new Poller(config, statePath)` and call its `start()`/`stop()` methods. Access internal state via `poller.getStateStore()` and `poller.getPlanQueue()`
- For graceful shutdown testing, call `poller.stop()` which internally calls `planQueue.shutdown()` -> `bridge.killAll()` (sends SIGTERM then SIGKILL to active claude child processes)
## Acceptance
- [ ] README.md covers setup, configuration, usage, and troubleshooting
- [ ] CLAUDE.md has project-specific section with architecture and conventions
- [ ] Integration test: new Lark tasks -> epics created in .flow/
- [ ] Integration test: re-sync same tasks -> no duplicates
- [ ] Integration test: plan failure -> state reflects failure, retried next cycle
- [ ] All tests pass with `npm test`
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
