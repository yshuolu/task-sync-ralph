# fn-1-lark-tasksync-daemon.3 Claude planning bridge

## Description
Build the module that invokes `claude -p` in headless mode to trigger `/flow-next:plan` for newly created epics, with queuing, timeout, and retry logic.

**Size:** M
**Files:** `src/planner/bridge.ts`, `src/planner/queue.ts`, `src/planner/types.ts`

## Approach

- Create a Claude bridge module that spawns `claude -p` as a child process using Node.js `spawn`
  - Construct prompt: `/flow-next:plan <epic-id> --research=grep --review=none` with Lark task description as additional context
  - Use `--output-format json` for structured result parsing
  - Use `--max-turns 50` to prevent infinite loops
  - Enforce wall-clock timeout via `AbortController` (configurable, default 30 min)
  - Track child PIDs in a `Set<ChildProcess>` for cleanup on shutdown
- Create a plan queue using `p-queue` with configurable concurrency (default 1)
  - Queue items: `{ epicId, larkTaskGuid, larkSummary, larkDescription }`
  - On success: update sync state to `synced`
  - On failure: increment `failure_count`, set `sync_status: failed`
  - Skip tasks exceeding `maxRetries` — set `sync_status: skipped`
- Integrate with sync engine: after epic creation, enqueue plan job

## Key context

- Use `spawn` (streaming), NOT `exec` (buffers all stdout in memory) for long-running Claude processes
- Each `claude -p` invocation gets a fresh session — do NOT pass `--session-id` across tasks (context pollution)
- Ralph uses this same pattern: fresh sessions per iteration (ref: Ralph docs)
- The `.claude/settings.local.json` confirms `flow-next` plugin is enabled — verify `claude -p` respects project plugin settings
- `--dangerously-skip-permissions` may be needed for unattended operation — make configurable
- Do NOT use `--no-session-persistence` — session logs are useful for debugging
## Acceptance
- [ ] `claude -p` spawned with correct flags and prompt for each epic
- [ ] Lark task description included as context in the planning prompt
- [ ] Queue limits concurrency (default 1, configurable)
- [ ] Wall-clock timeout kills stuck Claude processes (default 30 min)
- [ ] Child PIDs tracked for cleanup
- [ ] Sync state updated on plan success/failure
- [ ] Tasks exceeding max retries marked as `skipped`
- [ ] No zombie claude processes after timeout or shutdown
## Done summary
Built the Claude planning bridge module that spawns `claude -p` in headless mode for each new epic, with a p-queue-based job queue (configurable concurrency), wall-clock timeout via AbortController, child PID tracking for zombie prevention, and retry/skip logic integrated with the sync state store.
## Evidence
- Commits: 4c867e74508eea444c237b739f375b223b8d1d9f
- Tests: npx tsc --noEmit, npm test
- PRs: