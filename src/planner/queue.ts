/**
 * Plan queue: manages the queue of planning jobs with configurable
 * concurrency using p-queue.
 *
 * Integrates with the Claude bridge for planning and the state store
 * for tracking success/failure of each plan job.
 */

import PQueue from "p-queue";
import { ClaudeBridge } from "./bridge.js";
import type { PlanJob, PlanResult, ClaudeBridgeOptions } from "./types.js";
import type { StateStore } from "../state/store.js";

export interface PlanQueueOptions {
  /** Max concurrent planning jobs (default 1) */
  concurrency: number;
  /** Max retries before marking as skipped */
  maxRetries: number;
  /** Claude bridge configuration */
  bridgeOptions: ClaudeBridgeOptions;
}

export class PlanQueue {
  private queue: PQueue;
  private bridge: ClaudeBridge;
  private stateStore: StateStore;
  private maxRetries: number;
  private stopped = false;

  constructor(stateStore: StateStore, options: PlanQueueOptions) {
    this.stateStore = stateStore;
    this.maxRetries = options.maxRetries;

    this.bridge = new ClaudeBridge(options.bridgeOptions);

    this.queue = new PQueue({
      concurrency: options.concurrency,
      autoStart: true,
    });
  }

  /**
   * Enqueue a planning job.
   * The job will run when a concurrency slot is available.
   *
   * On success: updates sync state to "synced"
   * On failure: increments failure_count, sets sync_status to "failed"
   * If maxRetries exceeded: marks as skipped (no further retries)
   */
  enqueue(job: PlanJob): void {
    if (this.stopped) {
      console.warn(
        `[plan-queue] Queue is stopped, rejecting job for epic ${job.epicId}`
      );
      return;
    }

    void this.queue.add(async () => {
      await this.executeJob(job);
    });

    console.log(
      `[plan-queue] Enqueued plan for epic ${job.epicId} (queue size: ${this.queue.size}, pending: ${this.queue.pending})`
    );
  }

  /**
   * Execute a single plan job and update state accordingly.
   */
  private async executeJob(job: PlanJob): Promise<void> {
    const entry = this.stateStore.getTask(job.larkTaskGuid);

    // Check if task has exceeded max retries before even starting
    if (entry && entry.failureCount >= this.maxRetries) {
      console.warn(
        `[plan-queue] Task ${job.larkTaskGuid} exceeded max retries (${this.maxRetries}), skipping`
      );
      return;
    }

    console.log(
      `[plan-queue] Starting plan for epic ${job.epicId} (task: ${job.larkTaskGuid})`
    );

    const result: PlanResult = await this.bridge.plan(
      job.epicId,
      job.larkSummary,
      job.larkDescription
    );

    // Fill in the task GUID (bridge doesn't know about it)
    result.larkTaskGuid = job.larkTaskGuid;

    const now = new Date().toISOString();

    if (result.success) {
      console.log(
        `[plan-queue] Plan succeeded for epic ${job.epicId} in ${result.durationMs}ms`
      );

      // Update state to synced
      if (entry) {
        entry.syncStatus = "synced";
        entry.lastSyncAt = now;
        entry.failureCount = 0;
        delete entry.lastError;
        this.stateStore.setTask(job.larkTaskGuid, entry);
      }
    } else {
      const failureCount = (entry?.failureCount ?? 0) + 1;
      console.error(
        `[plan-queue] Plan failed for epic ${job.epicId}: ${result.error ?? "unknown error"} (attempt ${failureCount}/${this.maxRetries})`
      );

      // Update state to failed
      if (entry) {
        entry.syncStatus = "failed";
        entry.lastSyncAt = now;
        entry.failureCount = failureCount;
        entry.lastError = result.error ?? "unknown error";
        this.stateStore.setTask(job.larkTaskGuid, entry);
      }
    }

    // Save state after each job
    try {
      await this.stateStore.save();
    } catch (err) {
      console.error(
        `[plan-queue] Failed to save state after job for ${job.epicId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Stop accepting new jobs and kill all active Claude processes.
   * Existing queued jobs will be cleared.
   */
  async shutdown(): Promise<void> {
    this.stopped = true;
    this.queue.clear();
    this.queue.pause();

    // Kill any active claude processes
    await this.bridge.killAll();

    console.log("[plan-queue] Queue shut down.");
  }

  /** Get the number of items waiting in the queue. */
  get size(): number {
    return this.queue.size;
  }

  /** Get the number of items currently being processed. */
  get pending(): number {
    return this.queue.pending;
  }

  /** Get count of active claude child processes. */
  getActiveProcessCount(): number {
    return this.bridge.getActiveCount();
  }

  /** Check if the queue is idle (no queued or running jobs). */
  get idle(): boolean {
    return this.queue.size === 0 && this.queue.pending === 0;
  }

  /** Wait for the queue to become idle. */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
