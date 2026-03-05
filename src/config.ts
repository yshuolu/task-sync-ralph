import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Configuration for TaskSync daemon.
 * Layered: env vars > config file (.tasksync/config.json) > defaults.
 */

export interface LarkConfig {
  appId: string;
  appSecret: string;
  domain: "lark" | "feishu";
  tasklistGuids: string[];
}

export interface PollConfig {
  intervalMs: number;
}

export interface PlanConfig {
  concurrency: number;
  timeoutMs: number;
  maxRetries: number;
  claudeArgs: string;
}

export interface TaskSyncConfig {
  lark: LarkConfig;
  poll: PollConfig;
  plan: PlanConfig;
  flowctlPath: string;
}

interface ConfigFileShape {
  lark?: {
    appId?: string;
    appSecret?: string;
    domain?: string;
    tasklistGuids?: string[];
  };
  poll?: {
    intervalMs?: number;
  };
  plan?: {
    concurrency?: number;
    timeoutMs?: number;
    maxRetries?: number;
    claudeArgs?: string;
  };
  flowctlPath?: string;
}

const CONFIG_FILE_PATH = resolve(".tasksync", "config.json");

function loadConfigFile(): ConfigFileShape {
  if (!existsSync(CONFIG_FILE_PATH)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_FILE_PATH, "utf-8");
    return JSON.parse(raw) as ConfigFileShape;
  } catch (err) {
    console.warn(
      `Warning: Failed to parse ${CONFIG_FILE_PATH}, using defaults. Error: ${err}`
    );
    return {};
  }
}

function parseTasklistGuids(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function validateDomain(value: string): "lark" | "feishu" {
  if (value !== "lark" && value !== "feishu") {
    throw new Error(
      `Invalid LARK_DOMAIN: "${value}". Must be "lark" or "feishu".`
    );
  }
  return value;
}

/**
 * Load and validate configuration.
 * Throws with a clear error if required values are missing.
 *
 * @param requireTasklists - If true, require LARK_TASKLIST_GUIDS to be set.
 *   The `discover` command does not need tasklist GUIDs, so set to false for that.
 */
export function loadConfig(
  options: { requireTasklists?: boolean } = {}
): TaskSyncConfig {
  const { requireTasklists = true } = options;
  const file = loadConfigFile();
  const env = process.env;

  // --- Lark credentials (required, env-only for secrets) ---
  const appId = env.LARK_APP_ID ?? file.lark?.appId;
  if (!appId) {
    throw new Error(
      "Missing required config: LARK_APP_ID. Set it as an environment variable."
    );
  }

  const appSecret = env.LARK_APP_SECRET ?? file.lark?.appSecret;
  if (!appSecret) {
    throw new Error(
      "Missing required config: LARK_APP_SECRET. Set it as an environment variable."
    );
  }

  // --- Lark domain ---
  const domainRaw = env.LARK_DOMAIN ?? file.lark?.domain ?? "lark";
  const domain = validateDomain(domainRaw);

  // --- Tasklist GUIDs ---
  let tasklistGuids: string[];
  if (env.LARK_TASKLIST_GUIDS) {
    tasklistGuids = parseTasklistGuids(env.LARK_TASKLIST_GUIDS);
  } else if (file.lark?.tasklistGuids) {
    tasklistGuids = file.lark.tasklistGuids;
  } else {
    tasklistGuids = [];
  }

  if (requireTasklists && tasklistGuids.length === 0) {
    throw new Error(
      'Missing required config: LARK_TASKLIST_GUIDS. Set it as an environment variable (comma-separated) or in .tasksync/config.json. Use "npx tsx src/cli.ts discover" to find available tasklist GUIDs.'
    );
  }

  // --- Poll config ---
  const intervalMs =
    env.TASKSYNC_POLL_INTERVAL_MS != null
      ? parseInt(env.TASKSYNC_POLL_INTERVAL_MS, 10)
      : (file.poll?.intervalMs ?? 300_000);

  if (isNaN(intervalMs) || intervalMs < 1000) {
    throw new Error(
      `Invalid TASKSYNC_POLL_INTERVAL_MS: must be a number >= 1000 (1 second).`
    );
  }

  // --- Plan config ---
  const concurrency =
    env.TASKSYNC_PLAN_CONCURRENCY != null
      ? parseInt(env.TASKSYNC_PLAN_CONCURRENCY, 10)
      : (file.plan?.concurrency ?? 1);

  const timeoutMs =
    env.TASKSYNC_PLAN_TIMEOUT_MS != null
      ? parseInt(env.TASKSYNC_PLAN_TIMEOUT_MS, 10)
      : (file.plan?.timeoutMs ?? 1_800_000);

  const maxRetries =
    env.TASKSYNC_PLAN_MAX_RETRIES != null
      ? parseInt(env.TASKSYNC_PLAN_MAX_RETRIES, 10)
      : (file.plan?.maxRetries ?? 3);

  const claudeArgs =
    env.TASKSYNC_CLAUDE_ARGS ?? file.plan?.claudeArgs ?? "";

  // --- flowctl path ---
  const flowctlPath = env.FLOWCTL_PATH ?? file.flowctlPath ?? ".flow/bin/flowctl";

  return {
    lark: {
      appId,
      appSecret,
      domain,
      tasklistGuids,
    },
    poll: {
      intervalMs,
    },
    plan: {
      concurrency,
      timeoutMs,
      maxRetries,
      claudeArgs,
    },
    flowctlPath,
  };
}
