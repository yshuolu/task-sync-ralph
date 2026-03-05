/**
 * flowctl client module.
 * Shells out to the flowctl binary and parses JSON responses.
 */

import { execFile } from "node:child_process";

interface FlowctlResult {
  success: boolean;
  [key: string]: unknown;
}

interface EpicCreateResult extends FlowctlResult {
  id: string;
  title: string;
}

export interface FlowctlEpic {
  id: string;
  title: string;
  status: string;
  task_count: number;
}

interface EpicsListResult extends FlowctlResult {
  epics: FlowctlEpic[];
}

function execFlowctl(
  flowctlPath: string,
  args: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      flowctlPath,
      args,
      { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `flowctl ${args.join(" ")} failed: ${error.message}${stderr ? `\nstderr: ${stderr}` : ""}`
            )
          );
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function parseJsonResponse<T extends FlowctlResult>(
  raw: string,
  command: string
): T {
  const parsed = JSON.parse(raw) as T;
  if (!parsed.success) {
    throw new Error(
      `flowctl ${command} returned success=false: ${JSON.stringify(parsed)}`
    );
  }
  return parsed;
}

export class FlowctlClient {
  private flowctlPath: string;

  constructor(flowctlPath: string) {
    this.flowctlPath = flowctlPath;
  }

  /** Create a new epic and return its ID. */
  async epicCreate(title: string): Promise<string> {
    const raw = await execFlowctl(this.flowctlPath, [
      "epic",
      "create",
      "--title",
      title,
      "--json",
    ]);
    const result = parseJsonResponse<EpicCreateResult>(raw, "epic create");
    return result.id;
  }

  /** List all existing epics. */
  async epicsList(): Promise<FlowctlEpic[]> {
    const raw = await execFlowctl(this.flowctlPath, ["epics", "--json"]);
    const result = parseJsonResponse<EpicsListResult>(raw, "epics");
    return result.epics;
  }
}
