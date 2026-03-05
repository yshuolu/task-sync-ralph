/**
 * Lark API client wrapper.
 *
 * Authenticates with tenant_access_token (handled automatically by the SDK)
 * and provides methods to list tasklists and fetch tasks from a tasklist.
 *
 * Key API constraints:
 * - task.v2.task.list only supports user_access_token -- do NOT use
 * - task.v2.tasklist.tasks supports tenant_access_token -- use this
 * - tasklist.listWithIterator handles pagination automatically
 * - tasklist.tasks does NOT have a WithIterator variant, so we paginate manually
 */

import * as lark from "@larksuiteoapi/node-sdk";
import type { LarkConfig } from "../config.js";
import type { LarkTask, LarkTasklist } from "./types.js";

/**
 * Create and return a configured Lark SDK client.
 */
function createSdkClient(config: LarkConfig): InstanceType<typeof lark.Client> {
  const domain =
    config.domain === "feishu" ? lark.Domain.Feishu : lark.Domain.Lark;

  return new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain,
  });
}

/**
 * Wrapper around the Lark SDK providing typed task API access.
 */
export class LarkClient {
  private client: InstanceType<typeof lark.Client>;
  private config: LarkConfig;

  constructor(config: LarkConfig) {
    this.config = config;
    this.client = createSdkClient(config);
  }

  /**
   * List all available tasklists.
   * Uses the SDK's listWithIterator for automatic pagination.
   */
  async listTasklists(): Promise<LarkTasklist[]> {
    const tasklists: LarkTasklist[] = [];

    const iter = await this.client.task.v2.tasklist.listWithIterator({
      params: {
        page_size: 50,
      },
    });

    for await (const page of iter) {
      if (page?.items) {
        tasklists.push(...(page.items as LarkTasklist[]));
      }
    }

    return tasklists;
  }

  /**
   * Fetch all tasks from a specific tasklist.
   * Handles pagination manually since tasklist.tasks does not have a WithIterator variant.
   *
   * @param tasklistGuid - The GUID of the tasklist to fetch tasks from.
   * @param options - Optional filters for the task query.
   */
  async fetchTasks(
    tasklistGuid: string,
    options?: {
      completed?: boolean;
    }
  ): Promise<LarkTask[]> {
    const tasks: LarkTask[] = [];
    let pageToken: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.task.v2.tasklist.tasks({
        params: {
          page_size: 50,
          ...(pageToken ? { page_token: pageToken } : {}),
          ...(options?.completed !== undefined
            ? { completed: options.completed }
            : {}),
        },
        path: {
          tasklist_guid: tasklistGuid,
        },
      });

      if (response?.code !== 0) {
        throw new Error(
          `Lark API error fetching tasks for tasklist ${tasklistGuid}: code=${response?.code}, msg=${response?.msg}`
        );
      }

      const items = response?.data?.items;
      if (items) {
        tasks.push(...(items as LarkTask[]));
      }

      pageToken = response?.data?.page_token;
      hasMore = response?.data?.has_more ?? false;
    }

    return tasks;
  }

  /**
   * Fetch tasks from all configured tasklists.
   * Returns a map from tasklist GUID to its tasks.
   */
  async fetchAllTasks(): Promise<Map<string, LarkTask[]>> {
    const result = new Map<string, LarkTask[]>();

    for (const guid of this.config.tasklistGuids) {
      const tasks = await this.fetchTasks(guid);
      result.set(guid, tasks);
    }

    return result;
  }

  /**
   * Get the domain being used (for diagnostics).
   */
  get domain(): string {
    return this.config.domain;
  }
}
