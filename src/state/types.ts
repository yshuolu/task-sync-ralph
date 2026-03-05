/**
 * Types for the sync state store.
 * State lives at .tasksync/state.json and tracks which Lark tasks
 * have been synced to flow-next epics.
 */

export type SyncStatus = "synced" | "pending_plan" | "failed" | "skipped";

export interface SyncedTaskEntry {
  /** Lark task GUID */
  taskGuid: string;
  /** Lark tasklist GUID this task belongs to */
  tasklistGuid: string;
  /** Lark task summary at time of sync */
  summary: string;
  /** The flow-next epic ID that was created */
  epicId: string;
  /** Current sync status */
  syncStatus: SyncStatus;
  /** ISO timestamp of first sync attempt */
  firstSeenAt: string;
  /** ISO timestamp of last sync attempt */
  lastSyncAt: string;
  /** Number of consecutive failures (reset on success) */
  failureCount: number;
  /** Last error message if syncStatus is "failed" */
  lastError?: string;
}

export interface SyncState {
  /** Schema version for forward compatibility */
  version: 1;
  /** ISO timestamp of last completed poll cycle */
  lastPoll: string | null;
  /** Map from Lark task GUID to sync entry */
  tasks: Record<string, SyncedTaskEntry>;
}
