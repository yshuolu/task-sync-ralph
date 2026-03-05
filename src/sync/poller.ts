/**
 * Sync poller: periodically fetches Lark tasks, diffs against state,
 * creates flow-next epics for new tasks, and updates state.
 *
 * Uses drift-protected intervals (scheduling based on absolute time)
 * and exponential backoff on API errors.
 */

import type { TaskSyncConfig } from "../config.js";
import { LarkClient } from "../lark/client.js";
import { FlowctlClient } from "../flowctl/client.js";
import { StateStore } from "../state/store.js";
import type { SyncedTaskEntry } from "../state/types.js";
import { diffTasks } from "./differ.js";
import type { TaskToSync } from "./types.js";
import { PlanQueue, type PlanQueueOptions } from "../planner/queue.js";

const INITIAL_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 60 minutes
const BACKOFF_MULTIPLIER = 2;

export class Poller {
  private config: TaskSyncConfig;
  private larkClient: LarkClient;
  private flowctlClient: FlowctlClient;
  private stateStore: StateStore;
  private planQueue: PlanQueue;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private consecutiveErrors = 0;

  /** Optional callback invoked after each tick completes (success or failure). */
  onTickComplete: (() => void) | null = null;

  constructor(config: TaskSyncConfig, statePath?: string) {
    this.config = config;
    this.larkClient = new LarkClient(config.lark);
    this.flowctlClient = new FlowctlClient(config.flowctlPath);
    this.stateStore = new StateStore(statePath);

    const planQueueOptions: PlanQueueOptions = {
      concurrency: config.plan.concurrency,
      maxRetries: config.plan.maxRetries,
      bridgeOptions: {
        timeoutMs: config.plan.timeoutMs,
        extraArgs: config.plan.claudeArgs,
        dangerouslySkipPermissions: config.plan.dangerouslySkipPermissions,
      },
    };
    this.planQueue = new PlanQueue(this.stateStore, planQueueOptions);
  }

  /** Start the polling loop. */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Load existing state
    this.stateStore.load();

    // Run first tick immediately
    void this.tick();
  }

  /** Stop the polling loop and shut down the plan queue. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.planQueue.shutdown();
  }

  /** Schedule the next tick with drift protection. */
  private scheduleNext(): void {
    if (!this.running) return;

    const delay = this.getNextDelay();
    const nextTick = Date.now() + delay;

    this.timer = setTimeout(() => {
      if (!this.running) return;
      void this.tick();
    }, delay);

    console.log(
      `Next sync scheduled at ${new Date(nextTick).toISOString()} (in ${Math.round(delay / 1000)}s)`
    );
  }

  /** Calculate delay for next tick, applying backoff if needed. */
  private getNextDelay(): number {
    if (this.consecutiveErrors === 0) {
      return this.config.poll.intervalMs;
    }

    // Exponential backoff: 5min -> 10min -> 20min -> 40min -> 60min (cap)
    const backoff =
      INITIAL_BACKOFF_MS *
      Math.pow(BACKOFF_MULTIPLIER, this.consecutiveErrors - 1);
    return Math.min(backoff, MAX_BACKOFF_MS);
  }

  /** Execute one sync cycle. */
  private async tick(): Promise<void> {
    const cycleStart = new Date().toISOString();
    console.log(`[${cycleStart}] Starting sync cycle...`);

    try {
      await this.stateStore.acquireLock();

      try {
        // Reload state in case another process modified it
        this.stateStore.load();

        // Fetch all tasks from Lark
        const tasksByTasklist = await this.larkClient.fetchAllTasks();

        // Diff against state
        const diff = diffTasks(
          tasksByTasklist,
          this.stateStore.getState(),
          this.config.plan.maxRetries
        );

        console.log(
          `Diff: ${diff.toSync.length} to sync, ${diff.alreadySyncedCount} already synced, ${diff.permanentlyFailedCount} permanently failed`
        );

        // Create epics for new tasks
        for (const item of diff.toSync) {
          await this.syncTask(item);
        }

        // Update last poll timestamp and save
        this.stateStore.setLastPoll(cycleStart);
        await this.stateStore.save();

        // Reset backoff on success
        this.consecutiveErrors = 0;
        console.log(`Sync cycle complete.`);
      } finally {
        await this.stateStore.releaseLock();
      }
    } catch (err) {
      this.consecutiveErrors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Sync cycle failed (consecutive errors: ${this.consecutiveErrors}): ${message}`
      );
    }

    this.onTickComplete?.();
    this.scheduleNext();
  }

  /** Sync a single task: create a flow-next epic, enqueue plan job, and update state. */
  private async syncTask(item: TaskToSync): Promise<void> {
    const summary = item.task.summary ?? "(untitled)";
    const now = new Date().toISOString();

    try {
      // For retries where epic already exists, skip epic creation
      const existing = this.stateStore.getTask(item.taskGuid);
      let epicId: string;

      if (existing?.epicId) {
        epicId = existing.epicId;
        console.log(
          `Reusing existing epic ${epicId} for Lark task ${item.taskGuid}: "${summary}"`
        );
      } else {
        epicId = await this.flowctlClient.epicCreate(summary);
        console.log(
          `Created epic ${epicId} for Lark task ${item.taskGuid}: "${summary}"`
        );
      }

      // Mark as pending_plan and enqueue the planning job
      const entry: SyncedTaskEntry = {
        taskGuid: item.taskGuid,
        tasklistGuid: item.tasklistGuid,
        summary,
        epicId,
        syncStatus: "pending_plan",
        firstSeenAt: item.isRetry
          ? (existing?.firstSeenAt ?? now)
          : now,
        lastSyncAt: now,
        failureCount: existing?.failureCount ?? 0,
      };

      this.stateStore.setTask(item.taskGuid, entry);

      // Enqueue the plan job — the queue will update state on completion
      this.planQueue.enqueue({
        epicId,
        larkTaskGuid: item.taskGuid,
        larkSummary: summary,
        // LarkTask doesn't have description in the current type, but summary is available
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Failed to sync task ${item.taskGuid} ("${summary}"): ${message}`
      );

      const existing = this.stateStore.getTask(item.taskGuid);
      const entry: SyncedTaskEntry = {
        taskGuid: item.taskGuid,
        tasklistGuid: item.tasklistGuid,
        summary,
        epicId: existing?.epicId ?? "",
        syncStatus: "failed",
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSyncAt: now,
        failureCount: (existing?.failureCount ?? 0) + 1,
        lastError: message,
      };

      this.stateStore.setTask(item.taskGuid, entry);
    }
  }

  /** Expose state store for testing/inspection. */
  getStateStore(): StateStore {
    return this.stateStore;
  }

  /** Expose plan queue for testing/inspection. */
  getPlanQueue(): PlanQueue {
    return this.planQueue;
  }
}
