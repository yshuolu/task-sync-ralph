/**
 * Types for Lark Task v2 API responses.
 * Derived from the @larksuiteoapi/node-sdk type definitions.
 */

/** A member reference (creator, owner, or member of a tasklist/task). */
export interface LarkMember {
  id?: string;
  type?: string;
  role?: string;
  name?: string;
}

/** A tasklist as returned by tasklist.list / tasklist.listWithIterator. */
export interface LarkTasklist {
  guid?: string;
  name?: string;
  creator?: LarkMember;
  owner?: LarkMember;
  members?: LarkMember[];
  url?: string;
  created_at?: string;
  updated_at?: string;
  archive_msec?: string;
}

/** A timestamp with optional all-day flag. */
export interface LarkTimestamp {
  timestamp?: string;
  is_all_day?: boolean;
}

/** A task item as returned by tasklist.tasks. */
export interface LarkTask {
  guid?: string;
  summary?: string;
  completed_at?: string;
  start?: LarkTimestamp;
  due?: LarkTimestamp;
  members?: LarkMember[];
  subtask_count?: number;
}

/** Response shape for tasklist.tasks (single page). */
export interface LarkTasksResponse {
  code?: number;
  msg?: string;
  data?: {
    items?: LarkTask[];
    page_token?: string;
    has_more?: boolean;
  };
}
