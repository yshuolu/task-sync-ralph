/**
 * Health file writer.
 * Writes .tasksync/health.json after each poll cycle
 * so CLI `status` can report daemon health.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface HealthData {
  lastPoll: string | null;
  nextPoll: string | null;
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  daemonPid: number;
  uptime: number;
}

const HEALTH_FILE_PATH = ".tasksync/health.json";

export function writeHealth(data: HealthData): void {
  const dir = dirname(HEALTH_FILE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(HEALTH_FILE_PATH, JSON.stringify(data, null, 2) + "\n");
}

export function readHealth(): HealthData | null {
  if (!existsSync(HEALTH_FILE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(HEALTH_FILE_PATH, "utf-8")) as HealthData;
  } catch {
    return null;
  }
}

export function getHealthFilePath(): string {
  return HEALTH_FILE_PATH;
}
