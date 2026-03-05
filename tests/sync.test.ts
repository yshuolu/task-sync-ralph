/**
 * Integration tests for TaskSync.
 *
 * Tests the sync pipeline: diff engine, state store, plan queue,
 * and Claude bridge using mocked Lark data and a stub claude CLI script.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { StateStore } from "../src/state/store.js";
import type { SyncedTaskEntry } from "../src/state/types.js";
import { diffTasks } from "../src/sync/differ.js";
import type { LarkTask } from "../src/lark/types.js";
import { PlanQueue, type PlanQueueOptions } from "../src/planner/queue.js";

// Path to our mock claude script
const MOCK_CLAUDE_PATH = join(import.meta.dirname!, "helpers", "mock-claude.sh");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "tasksync-test-"));
}

function makeLarkTasks(count: number, prefix = "task"): LarkTask[] {
  return Array.from({ length: count }, (_, i) => ({
    guid: `${prefix}-guid-${i + 1}`,
    summary: `${prefix} ${i + 1}`,
  }));
}

describe("diffTasks", () => {
  it("identifies new tasks that need syncing", () => {
    const tasks = new Map<string, LarkTask[]>([
      ["tasklist-1", makeLarkTasks(3)],
    ]);

    const state = { version: 1 as const, lastPoll: null, tasks: {} };
    const result = diffTasks(tasks, state, 3);

    assert.equal(result.toSync.length, 3);
    assert.equal(result.alreadySyncedCount, 0);
    assert.equal(result.permanentlyFailedCount, 0);
    assert.equal(result.toSync[0].taskGuid, "task-guid-1");
    assert.equal(result.toSync[0].isRetry, false);
  });

  it("skips already-synced tasks", () => {
    const tasks = new Map<string, LarkTask[]>([
      ["tasklist-1", makeLarkTasks(3)],
    ]);

    const state = {
      version: 1 as const,
      lastPoll: "2026-01-01T00:00:00Z",
      tasks: {
        "task-guid-1": {
          taskGuid: "task-guid-1",
          tasklistGuid: "tasklist-1",
          summary: "task 1",
          epicId: "fn-10-task-1",
          syncStatus: "synced" as const,
          firstSeenAt: "2026-01-01T00:00:00Z",
          lastSyncAt: "2026-01-01T00:00:00Z",
          failureCount: 0,
        },
        "task-guid-2": {
          taskGuid: "task-guid-2",
          tasklistGuid: "tasklist-1",
          summary: "task 2",
          epicId: "fn-11-task-2",
          syncStatus: "synced" as const,
          firstSeenAt: "2026-01-01T00:00:00Z",
          lastSyncAt: "2026-01-01T00:00:00Z",
          failureCount: 0,
        },
        "task-guid-3": {
          taskGuid: "task-guid-3",
          tasklistGuid: "tasklist-1",
          summary: "task 3",
          epicId: "fn-12-task-3",
          syncStatus: "synced" as const,
          firstSeenAt: "2026-01-01T00:00:00Z",
          lastSyncAt: "2026-01-01T00:00:00Z",
          failureCount: 0,
        },
      },
    };

    const result = diffTasks(tasks, state, 3);

    assert.equal(result.toSync.length, 0);
    assert.equal(result.alreadySyncedCount, 3);
    assert.equal(result.permanentlyFailedCount, 0);
  });

  it("retries failed tasks below maxRetries", () => {
    const tasks = new Map<string, LarkTask[]>([
      ["tasklist-1", [{ guid: "task-guid-1", summary: "failing task" }]],
    ]);

    const state = {
      version: 1 as const,
      lastPoll: null,
      tasks: {
        "task-guid-1": {
          taskGuid: "task-guid-1",
          tasklistGuid: "tasklist-1",
          summary: "failing task",
          epicId: "fn-10-failing",
          syncStatus: "failed" as const,
          firstSeenAt: "2026-01-01T00:00:00Z",
          lastSyncAt: "2026-01-01T00:00:00Z",
          failureCount: 1,
          lastError: "plan failed",
        },
      },
    };

    const result = diffTasks(tasks, state, 3);

    assert.equal(result.toSync.length, 1);
    assert.equal(result.toSync[0].isRetry, true);
  });

  it("marks tasks as permanently failed when maxRetries exceeded", () => {
    const tasks = new Map<string, LarkTask[]>([
      ["tasklist-1", [{ guid: "task-guid-1", summary: "dead task" }]],
    ]);

    const state = {
      version: 1 as const,
      lastPoll: null,
      tasks: {
        "task-guid-1": {
          taskGuid: "task-guid-1",
          tasklistGuid: "tasklist-1",
          summary: "dead task",
          epicId: "fn-10-dead",
          syncStatus: "failed" as const,
          firstSeenAt: "2026-01-01T00:00:00Z",
          lastSyncAt: "2026-01-01T00:00:00Z",
          failureCount: 3,
          lastError: "plan failed 3 times",
        },
      },
    };

    const result = diffTasks(tasks, state, 3);

    assert.equal(result.toSync.length, 0);
    assert.equal(result.permanentlyFailedCount, 1);
  });
});

describe("StateStore", () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    statePath = join(tempDir, "state.json");
  });

  after(() => {
    // cleanup handled by OS for temp dirs
  });

  it("loads empty state when file does not exist", () => {
    const store = new StateStore(statePath);
    const state = store.load();

    assert.equal(state.version, 1);
    assert.equal(state.lastPoll, null);
    assert.deepEqual(state.tasks, {});
  });

  it("persists and reloads state", async () => {
    const store = new StateStore(statePath);
    store.load();

    const entry: SyncedTaskEntry = {
      taskGuid: "test-guid",
      tasklistGuid: "tasklist-1",
      summary: "Test task",
      epicId: "fn-10-test",
      syncStatus: "synced",
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSyncAt: "2026-01-01T00:00:00Z",
      failureCount: 0,
    };

    store.setTask("test-guid", entry);
    store.setLastPoll("2026-01-01T12:00:00Z");
    await store.save();

    // Reload in a new instance
    const store2 = new StateStore(statePath);
    const loaded = store2.load();

    assert.equal(loaded.lastPoll, "2026-01-01T12:00:00Z");
    assert.equal(loaded.tasks["test-guid"].epicId, "fn-10-test");
    assert.equal(loaded.tasks["test-guid"].syncStatus, "synced");
  });

  it("supports lock/unlock cycle", async () => {
    const store = new StateStore(statePath);
    store.load();

    // Should not throw
    await store.acquireLock();
    await store.releaseLock();
  });
});

describe("PlanQueue with mock claude", () => {
  let tempDir: string;
  let statePath: string;
  let stateStore: StateStore;

  beforeEach(() => {
    tempDir = makeTempDir();
    statePath = join(tempDir, "state.json");
    stateStore = new StateStore(statePath);
    stateStore.load();
  });

  function createQueue(
    behavior: string = "success",
    opts?: Partial<PlanQueueOptions>
  ): PlanQueue {
    // Set the mock behavior via env var for the mock script
    process.env.MOCK_CLAUDE_BEHAVIOR = behavior;

    const options: PlanQueueOptions = {
      concurrency: opts?.concurrency ?? 1,
      maxRetries: opts?.maxRetries ?? 3,
      bridgeOptions: {
        timeoutMs: opts?.bridgeOptions?.timeoutMs ?? 30_000,
        extraArgs: "",
        dangerouslySkipPermissions: false,
        ...opts?.bridgeOptions,
      },
    };

    return new PlanQueue(stateStore, options);
  }

  it("marks task as synced on successful plan", async () => {
    // Seed state with a pending task
    stateStore.setTask("lark-task-1", {
      taskGuid: "lark-task-1",
      tasklistGuid: "tasklist-1",
      summary: "Build feature X",
      epicId: "fn-10-feature-x",
      syncStatus: "pending_plan",
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSyncAt: "2026-01-01T00:00:00Z",
      failureCount: 0,
    });

    // Override PATH so "claude" resolves to our mock script
    const origPath = process.env.PATH;
    const mockDir = makeTempDir();
    // Create a symlink named "claude" pointing to our mock script
    const { symlinkSync } = await import("node:fs");
    symlinkSync(MOCK_CLAUDE_PATH, join(mockDir, "claude"));

    process.env.PATH = `${mockDir}:${origPath}`;
    process.env.MOCK_CLAUDE_BEHAVIOR = "success";

    try {
      const queue = createQueue("success");

      queue.enqueue({
        epicId: "fn-10-feature-x",
        larkTaskGuid: "lark-task-1",
        larkSummary: "Build feature X",
      });

      await queue.onIdle();

      const entry = stateStore.getTask("lark-task-1");
      assert.equal(entry?.syncStatus, "synced");
      assert.equal(entry?.failureCount, 0);
    } finally {
      process.env.PATH = origPath;
      await stateStore.save();
    }
  });

  it("marks task as failed on plan failure and increments failureCount", async () => {
    stateStore.setTask("lark-task-2", {
      taskGuid: "lark-task-2",
      tasklistGuid: "tasklist-1",
      summary: "Failing feature",
      epicId: "fn-11-failing",
      syncStatus: "pending_plan",
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSyncAt: "2026-01-01T00:00:00Z",
      failureCount: 0,
    });

    const origPath = process.env.PATH;
    const mockDir = makeTempDir();
    const { symlinkSync } = await import("node:fs");
    symlinkSync(MOCK_CLAUDE_PATH, join(mockDir, "claude"));

    process.env.PATH = `${mockDir}:${origPath}`;
    process.env.MOCK_CLAUDE_BEHAVIOR = "fail";

    try {
      const queue = createQueue("fail");

      queue.enqueue({
        epicId: "fn-11-failing",
        larkTaskGuid: "lark-task-2",
        larkSummary: "Failing feature",
      });

      await queue.onIdle();

      const entry = stateStore.getTask("lark-task-2");
      assert.equal(entry?.syncStatus, "failed");
      assert.equal(entry?.failureCount, 1);
      assert.ok(entry?.lastError);
    } finally {
      process.env.PATH = origPath;
    }
  });

  it("skips tasks that exceeded maxRetries", async () => {
    stateStore.setTask("lark-task-3", {
      taskGuid: "lark-task-3",
      tasklistGuid: "tasklist-1",
      summary: "Exhausted task",
      epicId: "fn-12-exhausted",
      syncStatus: "failed",
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSyncAt: "2026-01-01T00:00:00Z",
      failureCount: 3,
      lastError: "failed 3 times",
    });

    const origPath = process.env.PATH;
    const mockDir = makeTempDir();
    const { symlinkSync } = await import("node:fs");
    symlinkSync(MOCK_CLAUDE_PATH, join(mockDir, "claude"));

    process.env.PATH = `${mockDir}:${origPath}`;
    process.env.MOCK_CLAUDE_BEHAVIOR = "success";

    try {
      const queue = createQueue("success", { maxRetries: 3 });

      queue.enqueue({
        epicId: "fn-12-exhausted",
        larkTaskGuid: "lark-task-3",
        larkSummary: "Exhausted task",
      });

      await queue.onIdle();

      // Should still be failed, not updated to synced
      const entry = stateStore.getTask("lark-task-3");
      assert.equal(entry?.syncStatus, "failed");
      assert.equal(entry?.failureCount, 3);
    } finally {
      process.env.PATH = origPath;
    }
  });
});

describe("Full sync cycle (diff + state)", () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    statePath = join(tempDir, "state.json");
  });

  it("new Lark tasks -> entries created -> re-sync produces no duplicates", async () => {
    const store = new StateStore(statePath);
    store.load();

    // Simulate 3 new Lark tasks
    const larkTasks = makeLarkTasks(3);
    const tasksByTasklist = new Map<string, LarkTask[]>([
      ["tasklist-1", larkTasks],
    ]);

    // First diff: all 3 are new
    const diff1 = diffTasks(tasksByTasklist, store.getState(), 3);
    assert.equal(diff1.toSync.length, 3);

    // Simulate epic creation + state update
    for (const item of diff1.toSync) {
      const entry: SyncedTaskEntry = {
        taskGuid: item.taskGuid,
        tasklistGuid: item.tasklistGuid,
        summary: item.task.summary ?? "",
        epicId: `fn-${item.taskGuid}`,
        syncStatus: "synced",
        firstSeenAt: "2026-01-01T00:00:00Z",
        lastSyncAt: "2026-01-01T00:00:00Z",
        failureCount: 0,
      };
      store.setTask(item.taskGuid, entry);
    }
    await store.save();

    // Second diff with same tasks: nothing to sync
    const diff2 = diffTasks(tasksByTasklist, store.getState(), 3);
    assert.equal(diff2.toSync.length, 0);
    assert.equal(diff2.alreadySyncedCount, 3);
  });

  it("partial failure -> state reflects failure, retried on next cycle", async () => {
    const store = new StateStore(statePath);
    store.load();

    const larkTasks = makeLarkTasks(3);
    const tasksByTasklist = new Map<string, LarkTask[]>([
      ["tasklist-1", larkTasks],
    ]);

    // First diff: all 3 are new
    const diff1 = diffTasks(tasksByTasklist, store.getState(), 3);
    assert.equal(diff1.toSync.length, 3);

    // Simulate: 2 succeed, 1 fails
    for (let i = 0; i < diff1.toSync.length; i++) {
      const item = diff1.toSync[i];
      const entry: SyncedTaskEntry = {
        taskGuid: item.taskGuid,
        tasklistGuid: item.tasklistGuid,
        summary: item.task.summary ?? "",
        epicId: `fn-${item.taskGuid}`,
        syncStatus: i < 2 ? "synced" : "failed",
        firstSeenAt: "2026-01-01T00:00:00Z",
        lastSyncAt: "2026-01-01T00:00:00Z",
        failureCount: i < 2 ? 0 : 1,
        ...(i >= 2 ? { lastError: "plan failed" } : {}),
      };
      store.setTask(item.taskGuid, entry);
    }
    await store.save();

    // Verify state
    const failedEntry = store.getTask("task-guid-3");
    assert.equal(failedEntry?.syncStatus, "failed");
    assert.equal(failedEntry?.failureCount, 1);

    // Second cycle: only the failed task should be retried
    const diff2 = diffTasks(tasksByTasklist, store.getState(), 3);
    assert.equal(diff2.toSync.length, 1);
    assert.equal(diff2.toSync[0].taskGuid, "task-guid-3");
    assert.equal(diff2.toSync[0].isRetry, true);
    assert.equal(diff2.alreadySyncedCount, 2);
  });
});

describe("Graceful shutdown", () => {
  it("PlanQueue.shutdown clears queue and stops accepting jobs", async () => {
    const tempDir = makeTempDir();
    const statePath = join(tempDir, "state.json");
    const store = new StateStore(statePath);
    store.load();

    const origPath = process.env.PATH;
    const mockDir = makeTempDir();
    const { symlinkSync } = await import("node:fs");
    symlinkSync(MOCK_CLAUDE_PATH, join(mockDir, "claude"));

    process.env.PATH = `${mockDir}:${origPath}`;
    process.env.MOCK_CLAUDE_BEHAVIOR = "success";

    try {
      const queue = new PlanQueue(store, {
        concurrency: 1,
        maxRetries: 3,
        bridgeOptions: {
          timeoutMs: 30_000,
          extraArgs: "",
          dangerouslySkipPermissions: false,
        },
      });

      // Shut down before enqueuing
      await queue.shutdown();

      // Enqueue after shutdown — should be rejected
      store.setTask("lark-task-shutdown", {
        taskGuid: "lark-task-shutdown",
        tasklistGuid: "tasklist-1",
        summary: "Should not run",
        epicId: "fn-99-nope",
        syncStatus: "pending_plan",
        firstSeenAt: "2026-01-01T00:00:00Z",
        lastSyncAt: "2026-01-01T00:00:00Z",
        failureCount: 0,
      });

      queue.enqueue({
        epicId: "fn-99-nope",
        larkTaskGuid: "lark-task-shutdown",
        larkSummary: "Should not run",
      });

      // Queue should be idle (job was rejected)
      assert.equal(queue.idle, true);

      // State should still be pending_plan (not updated)
      const entry = store.getTask("lark-task-shutdown");
      assert.equal(entry?.syncStatus, "pending_plan");
    } finally {
      process.env.PATH = origPath;
    }
  });
});
