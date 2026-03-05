# fn-1-lark-tasksync-daemon.1 Project scaffolding and Lark client

## Description
Initialize the TypeScript/Node.js project and build the Lark API client module.

**Size:** M
**Files:** `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/lark/client.ts`, `src/lark/types.ts`, `src/config.ts`, `src/cli.ts` (discover command only)

## Approach

- Initialize Node.js project with TypeScript, ESM modules, and `tsx` for execution
- Install `@larksuiteoapi/node-sdk` for Lark API access with built-in token management
- Create a Lark client wrapper that:
  - Authenticates with `tenant_access_token` (app credentials via SDK)
  - Lists available tasklists via `client.task.v2.tasklist.listWithIterator()`
  - Fetches tasks from a specific tasklist via `client.task.v2.tasklist.tasksWithIterator()`
  - Handles pagination automatically via SDK iterators
- Create configuration module with layered config (env vars > config file > defaults)
- Create `discover` CLI command that lists available Lark tasklists for user to identify GUIDs
- Initialize git repo

## Key context

- `task.v2.task.list` (GET `/open-apis/task/v2/tasks`) only supports `user_access_token` — do NOT use this endpoint
- Use `task.v2.tasklist.tasks` (GET `/open-apis/task/v2/tasklists/:tasklist_guid/tasks`) which supports `tenant_access_token`
- The SDK's `listWithIterator()` handles pagination automatically — no manual `page_token` management needed
- Use `lark.Domain.Lark` or `lark.Domain.Feishu` from the SDK — do not hardcode domains
- Secrets (`LARK_APP_ID`, `LARK_APP_SECRET`) must only be in env vars, never config files
- Validate required config at startup, fail fast with clear error messages
## Acceptance
- [ ] `package.json` with TypeScript, tsx, @larksuiteoapi/node-sdk dependencies
- [ ] `tsconfig.json` configured for ESM + Node.js v22 target
- [ ] `.gitignore` includes node_modules, .env, .tasksync/state.json
- [ ] `.env.example` documents all required and optional env vars
- [ ] Lark client authenticates and fetches tasks from a tasklist
- [ ] `npx tsx src/cli.ts discover` lists available Lark tasklists
- [ ] Config module validates required values at startup
- [ ] Git repo initialized with initial commit
## Done summary
Scaffolded TypeScript/Node.js project with ESM, Lark SDK integration, layered config module with validation, and discover CLI command for listing Lark tasklists.
## Evidence
- Commits: 61471987abf99932d428b802a5f4a6951c6f8f20
- Tests: npx tsc --noEmit, npx tsx src/cli.ts --help, npx tsx src/cli.ts discover (config validation test)
- PRs: