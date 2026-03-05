#!/usr/bin/env node

/**
 * TaskSync CLI entry point.
 *
 * Usage:
 *   npx tsx src/cli.ts discover    - List available Lark tasklists
 *   npx tsx src/cli.ts start       - Start the daemon (future)
 *   npx tsx src/cli.ts stop        - Stop the daemon (future)
 *   npx tsx src/cli.ts status      - Check daemon status (future)
 *   npx tsx src/cli.ts sync-once   - One-shot sync (future)
 */

import { loadConfig } from "./config.js";
import { LarkClient } from "./lark/client.js";

const COMMANDS = ["discover", "start", "stop", "status", "sync-once"] as const;
type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log("TaskSync - Lark task management bridge for flow-next\n");
  console.log("Usage: npx tsx src/cli.ts <command>\n");
  console.log("Commands:");
  console.log("  discover    List available Lark tasklists and their GUIDs");
  console.log("  start       Start the sync daemon (not yet implemented)");
  console.log("  stop        Stop the sync daemon (not yet implemented)");
  console.log("  status      Check daemon status (not yet implemented)");
  console.log("  sync-once   Run a single sync cycle (not yet implemented)");
}

async function discoverCommand(): Promise<void> {
  console.log("Discovering Lark tasklists...\n");

  // discover does not require tasklist GUIDs (that's what we're discovering)
  const config = loadConfig({ requireTasklists: false });
  const client = new LarkClient(config.lark);

  const tasklists = await client.listTasklists();

  if (tasklists.length === 0) {
    console.log(
      "No tasklists found. Ensure the Lark app has been granted access to tasklists."
    );
    console.log(
      "Check that the app has the 'task:tasklist:read' scope enabled."
    );
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
      await discoverCommand();
      break;

    case "start":
    case "stop":
    case "status":
    case "sync-once":
      console.log(`Command "${command}" is not yet implemented.`);
      console.log("This will be added in a future task.");
      process.exit(0);
      break;
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
