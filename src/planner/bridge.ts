/**
 * Claude planning bridge.
 *
 * Spawns `claude -p` in headless mode to trigger `/flow-next:plan` for
 * newly created epics. Uses spawn (streaming) instead of exec (buffering)
 * for long-running processes. Each invocation gets a fresh session.
 *
 * Child PIDs are tracked in a Set for cleanup on shutdown.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { ClaudeBridgeOptions, PlanResult } from "./types.js";

const DEFAULT_MAX_TURNS = 50;

export class ClaudeBridge {
  private options: ClaudeBridgeOptions;
  /** Active child processes tracked for cleanup */
  private activeChildren: Set<ChildProcess> = new Set();

  constructor(options: ClaudeBridgeOptions) {
    this.options = options;
  }

  /**
   * Spawn `claude -p` to plan an epic.
   *
   * Constructs the prompt with `/flow-next:plan <epic-id>` and includes
   * Lark task context. Uses --output-format json for structured parsing
   * and --max-turns 50 to prevent infinite loops.
   *
   * @param epicId - The flow-next epic ID to plan
   * @param larkSummary - The Lark task title (included in prompt context)
   * @param larkDescription - Optional Lark task description (included in prompt context)
   * @returns PlanResult with success/failure info and duration
   */
  async plan(
    epicId: string,
    larkSummary: string,
    larkDescription?: string
  ): Promise<PlanResult> {
    const startTime = Date.now();

    // Build the prompt
    const contextLines: string[] = [
      `Plan the following epic: ${epicId}`,
      "",
      `Lark task title: ${larkSummary}`,
    ];
    if (larkDescription) {
      contextLines.push("", `Lark task description:`, larkDescription);
    }
    contextLines.push(
      "",
      `Run: /flow-next:plan ${epicId} --research=grep --review=none`
    );

    const prompt = contextLines.join("\n");

    // Build claude CLI arguments
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--max-turns",
      String(DEFAULT_MAX_TURNS),
    ];

    if (this.options.dangerouslySkipPermissions) {
      args.push("--dangerously-skip-permissions");
    }

    // Parse extra args if provided
    if (this.options.extraArgs.trim()) {
      const extraParts = this.options.extraArgs
        .trim()
        .split(/\s+/)
        .filter((s) => s.length > 0);
      args.push(...extraParts);
    }

    try {
      await this.spawnClaude(args, epicId);
      return {
        success: true,
        epicId,
        larkTaskGuid: "", // Filled in by the queue
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        epicId,
        larkTaskGuid: "", // Filled in by the queue
        error: message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Spawn the claude CLI process with timeout and PID tracking.
   */
  private spawnClaude(
    args: string[],
    epicId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortController = new AbortController();

      const child = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        signal: abortController.signal,
        // Do not inherit env vars that might interfere
        env: {
          ...process.env,
        },
      });

      this.activeChildren.add(child);

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Wall-clock timeout
      const timeout = setTimeout(() => {
        console.error(
          `[planner] Timeout (${this.options.timeoutMs}ms) reached for epic ${epicId}, killing claude process`
        );
        abortController.abort();
      }, this.options.timeoutMs);

      child.on("close", (code, signal) => {
        clearTimeout(timeout);
        this.activeChildren.delete(child);

        if (signal === "SIGTERM" || signal === "SIGKILL" || signal === "SIGABRT") {
          reject(
            new Error(
              `claude process killed by signal ${signal} (likely timeout) for epic ${epicId}`
            )
          );
          return;
        }

        if (code !== 0) {
          reject(
            new Error(
              `claude process exited with code ${String(code)} for epic ${epicId}${stderr ? `\nstderr: ${stderr.slice(0, 1000)}` : ""}`
            )
          );
          return;
        }

        // Try to parse JSON output to verify success
        try {
          const parsed = JSON.parse(stdout) as { result?: string; error?: string };
          if (parsed.error) {
            reject(new Error(`claude returned error: ${parsed.error}`));
            return;
          }
        } catch {
          // Non-JSON output is acceptable — claude may stream differently
          // As long as exit code is 0, consider it a success
        }

        console.log(`[planner] claude -p completed for epic ${epicId} (exit 0)`);
        resolve();
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        this.activeChildren.delete(child);

        // AbortError is expected when we timeout via AbortController
        if (err.name === "AbortError") {
          reject(
            new Error(
              `claude process aborted (timeout ${this.options.timeoutMs}ms) for epic ${epicId}`
            )
          );
          return;
        }

        reject(
          new Error(
            `Failed to spawn claude: ${err.message}. Is 'claude' CLI installed and in PATH?`
          )
        );
      });
    });
  }

  /**
   * Kill all active child processes.
   * Called during graceful shutdown to prevent zombie processes.
   */
  async killAll(): Promise<void> {
    if (this.activeChildren.size === 0) return;

    console.log(
      `[planner] Killing ${this.activeChildren.size} active claude process(es)...`
    );

    const killPromises: Promise<void>[] = [];

    for (const child of this.activeChildren) {
      killPromises.push(
        new Promise<void>((resolve) => {
          // Try SIGTERM first, then SIGKILL after 5 seconds
          child.kill("SIGTERM");

          const forceKillTimeout = setTimeout(() => {
            if (!child.killed) {
              console.warn(
                `[planner] Force killing claude process (pid ${String(child.pid)})`
              );
              child.kill("SIGKILL");
            }
          }, 5000);

          child.on("close", () => {
            clearTimeout(forceKillTimeout);
            resolve();
          });

          // Safety: if close never fires, resolve after 10s
          setTimeout(() => {
            clearTimeout(forceKillTimeout);
            resolve();
          }, 10_000);
        })
      );
    }

    await Promise.all(killPromises);
    this.activeChildren.clear();
    console.log("[planner] All claude processes terminated.");
  }

  /** Get count of active child processes. */
  getActiveCount(): number {
    return this.activeChildren.size;
  }
}
