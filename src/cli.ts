#!/usr/bin/env node

/**
 * TaskSync CLI entry point.
 *
 * Usage:
 *   npx tsx src/cli.ts discover    - List available Lark tasklists
 *   npx tsx src/cli.ts start       - Start the daemon (foreground)
 *   npx tsx src/cli.ts stop        - Stop the daemon
 *   npx tsx src/cli.ts status      - Check daemon status
 *   npx tsx src/cli.ts sync-once   - One-shot sync cycle
 */

import { unlinkSync } from "node:fs";
import { loadConfig } from "./config.js";
import { LarkClient } from "./lark/client.js";
import { Daemon, readPid, isProcessAlive, getPidFilePath } from "./daemon.js";
import { readHealth } from "./health.js";

const COMMANDS = ["discover", "start", "stop", "status", "sync-once"] as const;
type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log("TaskSync - Lark task management bridge for flow-next\n");
  console.log("Usage: npx tsx src/cli.ts <command>\n");
  console.log("Commands:");
  console.log("  discover    List available Lark tasklists and their GUIDs");
  console.log("  start       Start the sync daemon (foreground)");
  console.log("  stop        Stop the sync daemon");
  console.log("  status      Check daemon status");
  console.log("  sync-once   Run a single sync cycle");
}

async function discoverCommand(guidsOnly: boolean): Promise<void> {
  const config = loadConfig({ requireTasklists: false });
  const client = new LarkClient(config.lark);

  const tasklists = await client.listTasklists();

  if (tasklists.length === 0) {
    if (!guidsOnly) {
      console.log(
        "No tasklists found. Ensure the Lark app has been granted access to tasklists."
      );
      console.log(
        "Check that the app has the 'task:tasklist:read' scope enabled."
      );
    }
    return;
  }

  if (guidsOnly) {
    const guids = tasklists
      .map((tl) => tl.guid)
      .filter((g): g is string => !!g);
    console.log(guids.join(","));
    return;
  }

  console.log(`Found ${tasklists.length} tasklist(s):\n`);
  console.log("-".repeat(80));

  for (const tl of tasklists) {
    console.log(`  GUID:       ${tl.guid ?? "(unknown)"}`);
    console.log(`  Name:       ${tl.name ?? "(unnamed)"}`);
    if (tl.creator?.name) {
      console.log(`  Creator:    ${tl.creator.name}`);
    }
    if (tl.owner?.name) {
      console.log(`  Owner:      ${tl.owner.name}`);
    }
    if (tl.members && tl.members.length > 0) {
      console.log(
        `  Members:    ${tl.members.length} member(s)`
      );
    }
    if (tl.created_at) {
      console.log(
        `  Created:    ${new Date(parseInt(tl.created_at) * 1000).toISOString()}`
      );
    }
    if (tl.url) {
      console.log(`  URL:        ${tl.url}`);
    }
    console.log("-".repeat(80));
  }

  console.log(
    "\nTo sync a tasklist, set LARK_TASKLIST_GUIDS in your .env file."
  );
  console.log(
    'Example: LARK_TASKLIST_GUIDS="<guid1>,<guid2>"'
  );
}

function startCommand(): void {
  console.log("Validating configuration...");
  const config = loadConfig();
  console.log("Configuration valid.\n");

  const daemon = new Daemon(config);
  daemon.start();
}

function stopCommand(): void {
  const pid = readPid();

  if (pid === null) {
    console.log("No daemon is running (PID file not found).");
    process.exit(0);
  }

  if (!isProcessAlive(pid)) {
    console.log(`Daemon (PID ${pid}) is not running. Cleaning up stale PID file.`);
    try {
      unlinkSync(getPidFilePath());
    } catch {
      // ignore
    }
    process.exit(0);
  }

  console.log(`Sending SIGTERM to daemon (PID ${pid})...`);
  process.kill(pid, "SIGTERM");
  console.log("Stop signal sent.");
}

function statusCommand(): void {
  const pid = readPid();
  const health = readHealth();

  const alive = pid !== null && isProcessAlive(pid);

  console.log("TaskSync Daemon Status\n");
  console.log(`  Running:    ${alive ? `yes (PID ${pid})` : "no"}`);

  if (health) {
    console.log(`  Last poll:  ${health.lastPoll ?? "never"}`);
    console.log(`  Next poll:  ${health.nextPoll ?? "unknown"}`);
    console.log(`  Synced:     ${health.syncedCount}`);
    console.log(`  Pending:    ${health.pendingCount}`);
    console.log(`  Failed:     ${health.failedCount}`);
    console.log(`  Uptime:     ${formatUptime(health.uptime)}`);
  } else {
    console.log("  No health data available.");
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

async function syncOnceCommand(): Promise<void> {
  console.log("Validating configuration...");
  const config = loadConfig();
  console.log("Configuration valid.\n");

  console.log("Running single sync cycle...\n");

  const daemon = new Daemon(config);
  const poller = daemon.getPoller();

  // Wait for one tick to complete, then stop
  await new Promise<void>((resolve) => {
    poller.onTickComplete = () => {
      resolve();
    };
    poller.start();
  });

  await poller.stop();
  await poller.getStateStore().save();
  console.log("\nSync-once complete.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = args[0] as Command;

  if (!COMMANDS.includes(command)) {
    console.error(`Error: Unknown command "${args[0]}"\n`);
    printUsage();
    process.exit(1);
  }

  switch (command) {
    case "discover":
      await discoverCommand(args.includes("--guids-only"));
      break;

    case "start":
      startCommand();
      break;

    case "stop":
      stopCommand();
      break;

    case "status":
      statusCommand();
      break;

    case "sync-once":
      await syncOnceCommand();
      break;
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
