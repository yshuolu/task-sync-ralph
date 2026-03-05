/**
 * Daemon lifecycle management.
 * Handles PID file, signal handling, graceful shutdown,
 * config reload (SIGHUP), and health file updates.
 */

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { loadConfig, type TaskSyncConfig } from "./config.js";
import { Poller } from "./sync/poller.js";
import { writeHealth, type HealthData } from "./health.js";
import type { SyncStatus } from "./state/types.js";

const PID_FILE_PATH = ".tasksync/daemon.pid";
const FORCED_EXIT_TIMEOUT_MS = 15_000;

export function getPidFilePath(): string {
  return PID_FILE_PATH;
}

/**
 * Read the PID from the PID file. Returns null if missing or invalid.
 */
export function readPid(): number | null {
  if (!existsSync(PID_FILE_PATH)) return null;
  const raw = readFileSync(PID_FILE_PATH, "utf-8").trim();
  const pid = parseInt(raw, 10);
  return isNaN(pid) ? null : pid;
}

/**
 * Check if a process is alive by sending signal 0.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class Daemon {
  private poller: Poller;
  private config: TaskSyncConfig;
  private startedAt: number;
  private isShuttingDown = false;

  constructor(config: TaskSyncConfig) {
    this.config = config;
    this.startedAt = Date.now();
    this.poller = new Poller(config);
  }

  start(): void {
    this.checkPidFile();
    this.writePidFile();

    // Clean up PID file on exit (normal or abnormal)
    process.on("exit", () => this.cleanupPidFile());

    // Signal handlers
    const gracefulShutdown = () => this.gracefulShutdown();
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGHUP", () => this.reloadConfig());

    // Health updates after each poll cycle
    this.poller.onTickComplete = () => this.updateHealth();

    console.log(`Daemon started (PID: ${process.pid})`);
    console.log(
      `Poll interval: ${this.config.poll.intervalMs / 1000}s, Plan concurrency: ${this.config.plan.concurrency}`
    );
    this.poller.start();
  }

  private gracefulShutdown(): void {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log("\nReceived shutdown signal, stopping gracefully...");

    // Forced exit timeout
    const forceTimer = setTimeout(() => {
      console.error(
        "Graceful shutdown timed out after 15s, forcing exit."
      );
      process.exit(1);
    }, FORCED_EXIT_TIMEOUT_MS);
    forceTimer.unref();

    void this.poller
      .stop()
      .then(async () => {
        await this.poller.getStateStore().save();
        console.log("Daemon stopped gracefully.");
        process.exit(0);
      })
      .catch((err: unknown) => {
        console.error(
          "Error during shutdown:",
          err instanceof Error ? err.message : err
        );
        process.exit(1);
      });
  }

  private reloadConfig(): void {
    console.log("Received SIGHUP, reloading config...");
    try {
      this.config = loadConfig();
      console.log("Config reloaded successfully.");
    } catch (err: unknown) {
      console.error(
        "Failed to reload config:",
        err instanceof Error ? err.message : err
      );
    }
  }

  private updateHealth(): void {
    try {
      const state = this.poller.getStateStore().getState();
      const tasks = Object.values(state.tasks);

      const counts: Record<SyncStatus, number> = {
        synced: 0,
        pending_plan: 0,
        failed: 0,
        skipped: 0,
      };

      for (const t of tasks) {
        counts[t.syncStatus]++;
      }

      const now = Date.now();
      const health: HealthData = {
        lastPoll: state.lastPoll,
        nextPoll: state.lastPoll
          ? new Date(
              new Date(state.lastPoll).getTime() +
                this.config.poll.intervalMs
            ).toISOString()
          : null,
        syncedCount: counts.synced,
        pendingCount: counts.pending_plan,
        failedCount: counts.failed,
        daemonPid: process.pid,
        uptime: Math.round((now - this.startedAt) / 1000),
      };

      writeHealth(health);
    } catch (err: unknown) {
      console.error(
        "Failed to write health file:",
        err instanceof Error ? err.message : err
      );
    }
  }

  /** Expose poller for sync-once mode. */
  getPoller(): Poller {
    return this.poller;
  }

  // --- PID file management ---

  private checkPidFile(): void {
    const pid = readPid();
    if (pid === null) return;

    if (isProcessAlive(pid)) {
      throw new Error(
        `Daemon already running (PID: ${pid}). Stop it first with 'tasksync stop'.`
      );
    }

    // Stale PID file — process no longer alive
    console.log(`Removing stale PID file (PID ${pid} is not running).`);
    unlinkSync(PID_FILE_PATH);
  }

  private writePidFile(): void {
    const dir = dirname(PID_FILE_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(PID_FILE_PATH, String(process.pid) + "\n");
  }

  private cleanupPidFile(): void {
    try {
      if (existsSync(PID_FILE_PATH)) {
        const raw = readFileSync(PID_FILE_PATH, "utf-8").trim();
        if (parseInt(raw, 10) === process.pid) {
          unlinkSync(PID_FILE_PATH);
        }
      }
    } catch {
      // Best-effort cleanup on exit
    }
  }
}
