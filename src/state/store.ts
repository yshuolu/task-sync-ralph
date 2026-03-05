/**
 * Atomic state store for sync state.
 * Uses write-file-atomic for crash-safe writes and proper-lockfile
 * to prevent concurrent access from multiple daemon instances.
 */

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { lock } from "proper-lockfile";
import type { SyncState, SyncedTaskEntry } from "./types.js";

const DEFAULT_STATE_PATH = ".tasksync/state.json";

function emptyState(): SyncState {
  return {
    version: 1,
    lastPoll: null,
    tasks: {},
  };
}

export class StateStore {
  private statePath: string;
  private state: SyncState;
  private lockRelease: (() => Promise<void>) | null = null;

  constructor(statePath: string = DEFAULT_STATE_PATH) {
    this.statePath = statePath;
    this.state = emptyState();
  }

  /** Load state from disk. Returns empty state if file doesn't exist. */
  load(): SyncState {
    if (!existsSync(this.statePath)) {
      this.state = emptyState();
      return this.state;
    }

    const raw = readFileSync(this.statePath, "utf-8");
    const parsed = JSON.parse(raw) as SyncState;

    if (parsed.version !== 1) {
      throw new Error(
        `Unsupported state version: ${String(parsed.version)}. Expected 1.`
      );
    }

    this.state = parsed;
    return this.state;
  }

  /** Write current state to disk atomically. */
  async save(): Promise<void> {
    const dir = dirname(this.statePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    await writeFileAtomic(
      this.statePath,
      JSON.stringify(this.state, null, 2) + "\n"
    );
  }

  /** Acquire a lockfile to prevent concurrent state access. */
  async acquireLock(): Promise<void> {
    const dir = dirname(this.statePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Lock on the directory since the state file may not exist yet
    this.lockRelease = await lock(dir, {
      stale: 30_000,
      retries: { retries: 3, minTimeout: 500, maxTimeout: 3000 },
    });
  }

  /** Release the lockfile. */
  async releaseLock(): Promise<void> {
    if (this.lockRelease) {
      await this.lockRelease();
      this.lockRelease = null;
    }
  }

  /** Get the current in-memory state. */
  getState(): SyncState {
    return this.state;
  }

  /** Get a specific task entry by GUID. */
  getTask(taskGuid: string): SyncedTaskEntry | undefined {
    return this.state.tasks[taskGuid];
  }

  /** Set or update a task entry. */
  setTask(taskGuid: string, entry: SyncedTaskEntry): void {
    this.state.tasks[taskGuid] = entry;
  }

  /** Update the lastPoll timestamp. */
  setLastPoll(isoTimestamp: string): void {
    this.state.lastPoll = isoTimestamp;
  }
}
