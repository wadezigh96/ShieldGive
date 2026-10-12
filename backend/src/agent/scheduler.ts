import cron from "node-cron";
import { agentTick } from "./pipeline.js";
import { storage } from "../services/storage.js";

let task: cron.ScheduledTask | null = null;

/**
 * Start the background monitoring agent only after storage initialization has
 * completed. PostgreSQL coordinates mint claims across service instances.
 */
export async function startAgent(): Promise<void> {
  const rawSeconds = Number.parseInt(process.env.POLL_INTERVAL_SECONDS || "30", 10);
  const seconds = Number.isFinite(rawSeconds) ? Math.max(10, rawSeconds) : 30;
  const expression =
    seconds < 60 ? `*/${seconds} * * * * *` : `*/${Math.floor(seconds / 60)} * * * *`;

  if (task) task.stop();
  task = cron.schedule(expression, () => {
    void agentTick();
  });

  await storage.addAgentLog("info", `Agent started — polling every ${seconds}s`, {
    expression,
    persistence: await storage.getStorageMode(),
  });
  void agentTick();
}

export async function stopAgent(): Promise<void> {
  if (!task) return;
  task.stop();
  task = null;
  await storage.addAgentLog("info", "Agent stopped");
}
