/**
 * Types for the Claude planning bridge.
 */

/** A job to be enqueued in the plan queue. */
export interface PlanJob {
  /** The flow-next epic ID to plan */
  epicId: string;
  /** Lark task GUID (for state tracking) */
  larkTaskGuid: string;
  /** Lark task summary (title) */
  larkSummary: string;
  /** Lark task description (optional, included as planning context) */
  larkDescription?: string;
}

/** Result of a plan execution. */
export interface PlanResult {
  /** Whether the plan succeeded */
  success: boolean;
  /** The epic ID that was planned */
  epicId: string;
  /** The Lark task GUID */
  larkTaskGuid: string;
  /** Error message if success is false */
  error?: string;
  /** Duration of the planning process in ms */
  durationMs: number;
}

/** Options for the Claude bridge spawn. */
export interface ClaudeBridgeOptions {
  /** Wall-clock timeout in ms (default 30 min) */
  timeoutMs: number;
  /** Extra arguments to pass to claude CLI */
  extraArgs: string;
  /** Whether to add --dangerously-skip-permissions flag */
  dangerouslySkipPermissions: boolean;
}
