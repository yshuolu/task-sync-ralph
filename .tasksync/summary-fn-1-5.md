## Summary

Created project documentation and integration tests for TaskSync:

- **README.md**: Setup instructions, configuration reference (all env vars and config keys), CLI usage (start/stop/status/discover/sync-once), sync architecture explanation, troubleshooting guide
- **CLAUDE.md**: Added project-specific section with architecture overview, key modules, Lark API notes, state files, commands, and conventions (above the flow-next block)
- **tests/sync.test.ts**: 13 integration tests across 5 suites covering:
  - Diff engine: new tasks, already-synced skip, retryable failures, permanently failed tasks
  - StateStore: empty state loading, persistence/reload, lock/unlock
  - PlanQueue with mock claude CLI: successful plan (synced state), failed plan (failure count), maxRetries skip
  - Full sync cycle: new tasks -> epics -> re-sync idempotency, partial failure -> retry on next cycle
  - Graceful shutdown: queue rejection after shutdown
- **tests/helpers/mock-claude.sh**: Configurable mock claude CLI (success/fail/hang modes)
- **tests/helpers/mock-lark.ts**: MockLarkClient returning configurable task data
- Updated `package.json` test script to use `node:test` runner with tsx
