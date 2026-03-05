/**
 * Mock Lark client for integration tests.
 * Returns configurable task lists from a predefined set of tasks.
 */

import type { LarkTask } from "../../src/lark/types.js";

export interface MockLarkTask {
  guid: string;
  summary: string;
}

/**
 * Creates a mock LarkClient class that returns configured tasks.
 * Use this in place of the real LarkClient.
 */
export class MockLarkClient {
  private tasksByTasklist: Map<string, LarkTask[]>;

  constructor(tasks: Map<string, MockLarkTask[]>) {
    this.tasksByTasklist = new Map();
    for (const [tasklistGuid, mockTasks] of tasks) {
      this.tasksByTasklist.set(
        tasklistGuid,
        mockTasks.map((t) => ({
          guid: t.guid,
          summary: t.summary,
        }))
      );
    }
  }

  async fetchAllTasks(): Promise<Map<string, LarkTask[]>> {
    return this.tasksByTasklist;
  }

  get domain(): string {
    return "lark";
  }
}
