/**
 * Diff engine: compares Lark tasks against local sync state
 * to determine which tasks need to be synced.
 */

import type { LarkTask } from "../lark/types.js";
import type { SyncState } from "../state/types.js";
import type { DiffResult, TaskToSync } from "./types.js";

/**
 * Diff Lark tasks against sync state.
 *
 * A task needs syncing if:
 * - Its GUID is not in state (new task)
 * - Its state entry has syncStatus "failed" and failureCount < maxRetries (retryable)
 *
 * A task is skipped if:
 * - Its state entry has syncStatus "synced"
 * - Its state entry has syncStatus "failed" and failureCount >= maxRetries (permanent failure)
 *
 * @param tasksByTasklist - Map from tasklist GUID to its tasks (from LarkClient.fetchAllTasks)
 * @param state - Current sync state
 * @param maxRetries - Maximum number of retries for failed syncs
 */
export function diffTasks(
  tasksByTasklist: Map<string, LarkTask[]>,
  state: SyncState,
  maxRetries: number
): DiffResult {
  const toSync: TaskToSync[] = [];
  let alreadySyncedCount = 0;
  let permanentlyFailedCount = 0;

  for (const [tasklistGuid, tasks] of tasksByTasklist) {
    for (const task of tasks) {
      const guid = task.guid;
      if (!guid) continue;

      const existing = state.tasks[guid];

      if (!existing) {
        // New task — never seen before
        toSync.push({
          taskGuid: guid,
          tasklistGuid,
          task,
          isRetry: false,
        });
      } else if (existing.syncStatus === "synced") {
        alreadySyncedCount++;
      } else if (existing.syncStatus === "pending_plan") {
        // Planning is in progress — skip, don't re-enqueue
        alreadySyncedCount++;
      } else if (existing.syncStatus === "skipped") {
        permanentlyFailedCount++;
      } else if (existing.syncStatus === "failed") {
        if (existing.failureCount < maxRetries) {
          // Retryable failure
          toSync.push({
            taskGuid: guid,
            tasklistGuid,
            task,
            isRetry: true,
          });
        } else {
          permanentlyFailedCount++;
        }
      }
    }
  }

  return { toSync, alreadySyncedCount, permanentlyFailedCount };
}
