import cron from "node-cron";
import { agentTick } from "./pipeline.js";
import { storage } from "../services/storage.js";

let task: cron.ScheduledTask | null = null;

/**
 * Start the background monitoring agent.
 * Default interval: every 30 seconds (configurable via POLL_INTERVAL_SECONDS).
 */
export function startAgent(): void {
  const seconds = Math.max(
    10,
    parseInt(process.env.POLL_INTERVAL_SECONDS || "30", 10)
  );

  // node-cron expression for every N seconds
  const expression =
    seconds < 60 ? `*/${seconds} * * * * *` : `*/${Math.floor(seconds / 60)} * * * *`;

  if (task) {
    task.stop();
  }

  task = cron.schedule(expression, () => {
    void agentTick();
  });

  storage.addAgentLog("info", `Agent started — polling every ${seconds}s`, {
    expression,
  });

  // Run one tick immediately so the dashboard is not empty
  void agentTick();
}

export function stopAgent(): void {
  if (task) {
    task.stop();
    task = null;
    storage.addAgentLog("info", "Agent stopped");
  }
}
