# TaskSync

## Architecture

TaskSync is a Node.js daemon that polls Lark tasklists and creates flow-next epics automatically.

**Key modules:**
- `src/cli.ts` — CLI entry point (discover, start, stop, status, sync-once)
- `src/daemon.ts` — Daemon lifecycle (PID file, signals, health updates)
- `src/config.ts` — Layered config (env vars > `.tasksync/config.json` > defaults)
- `src/lark/client.ts` — Lark SDK wrapper (tasklist discovery, task fetching with pagination)
- `src/lark/types.ts` — Lark API response types
- `src/sync/poller.ts` — Poll loop with drift protection and exponential backoff
- `src/sync/differ.ts` — Diffs Lark tasks against sync state (new, retryable, synced, permanently failed)
- `src/sync/types.ts` — DiffResult, TaskToSync types
- `src/state/store.ts` — Atomic state store (write-file-atomic + proper-lockfile)
- `src/state/types.ts` — SyncState, SyncedTaskEntry types
- `src/planner/bridge.ts` — Spawns `claude -p` with timeout and PID tracking
- `src/planner/queue.ts` — p-queue concurrency wrapper, updates state on success/failure
- `src/planner/types.ts` — PlanJob, PlanResult, ClaudeBridgeOptions types
- `src/flowctl/client.ts` — Shells out to flowctl binary for epic operations
- `src/health.ts` — Health file writer/reader (`.tasksync/health.json`)

**Lark API notes:**
- Uses `@larksuiteoapi/node-sdk` with `tenant_access_token` (auto-managed by SDK)
- `task.v2.tasklist.tasks` is the primary endpoint (supports tenant token)
- `task.v2.task.list` requires `user_access_token` — do NOT use
- Tasklist listing uses SDK's `listWithIterator`; tasks paginate manually

**State files** (in `.tasksync/`, gitignored):
- `state.json` — Sync state mapping Lark task GUIDs to epic IDs
- `health.json` — Last poll, next poll, counts, uptime
- `daemon.pid` — PID file for singleton enforcement
- `config.json` — Optional config overrides

## Commands

```bash
npm test              # Run integration tests
npm run typecheck     # TypeScript type checking
npm run start         # Start daemon
npm run stop          # Stop daemon
npm run status        # Check daemon status
npm run discover      # List Lark tasklists
npm run sync-once     # Single sync cycle
```

## Conventions

- ESM modules (`"type": "module"` in package.json)
- TypeScript strict mode, target ES2023
- `.js` extensions in imports (Node16 module resolution)
- Secrets via env vars only, never in config files

<!-- BEGIN FLOW-NEXT -->
## Flow-Next

This project uses Flow-Next for task tracking. Use `.flow/bin/flowctl` instead of markdown TODOs or TodoWrite.

**Quick commands:**
```bash
.flow/bin/flowctl list                # List all epics + tasks
.flow/bin/flowctl epics               # List all epics
.flow/bin/flowctl tasks --epic fn-N   # List tasks for epic
.flow/bin/flowctl ready --epic fn-N   # What's ready
.flow/bin/flowctl show fn-N.M         # View task
.flow/bin/flowctl start fn-N.M        # Claim task
.flow/bin/flowctl done fn-N.M --summary-file s.md --evidence-json e.json
```

**Creating a spec** ("create a spec", "spec out X", "write a spec for X"):

A spec = an epic. Create one directly — do NOT use `/flow-next:plan` (that breaks specs into tasks).

```bash
.flow/bin/flowctl epic create --title "Short title" --json
.flow/bin/flowctl epic set-plan <epic-id> --file - --json <<'EOF'
# Title

## Goal & Context
Why this exists, what problem it solves.

## Architecture & Data Models
System design, data flow, key components.

## API Contracts
Endpoints, interfaces, input/output shapes.

## Edge Cases & Constraints
Failure modes, limits, performance requirements.

## Acceptance Criteria
- [ ] Testable criterion 1
- [ ] Testable criterion 2

## Boundaries
What's explicitly out of scope.

## Decision Context
Why this approach over alternatives.
EOF
```

After creating a spec, choose next step:
- `/flow-next:plan <epic-id>` — research + break into tasks
- `/flow-next:interview <epic-id>` — deep Q&A to refine the spec

**Rules:**
- Use `.flow/bin/flowctl` for ALL task tracking
- Do NOT create markdown TODOs or use TodoWrite
- Re-anchor (re-read spec + status) before every task

**More info:** `.flow/bin/flowctl --help` or read `.flow/usage.md`
<!-- END FLOW-NEXT -->
