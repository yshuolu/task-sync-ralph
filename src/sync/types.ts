/**
 * Types for the sync engine.
 */

import type { LarkTask } from "../lark/types.js";

/** A Lark task that needs to be synced (new or retryable failure). */
export interface TaskToSync {
  taskGuid: string;
  tasklistGuid: string;
  task: LarkTask;
  /** True if this is a retry of a previously failed sync */
  isRetry: boolean;
}

/** Result of diffing Lark tasks against local state. */
export interface DiffResult {
  /** Tasks that need to be synced to flow-next */
  toSync: TaskToSync[];
  /** Number of tasks already synced */
  alreadySyncedCount: number;
  /** Number of tasks that permanently failed (exceeded maxRetries) */
  permanentlyFailedCount: number;
}
