import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRouter from "./routes/api.js";
import { startAgent } from "./agent/scheduler.js";
import { storage } from "./services/storage.js";

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3001", 10);

app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/health", async (_req, res) => {
  try {
    const persistence = await storage.getStorageMode();
    res.json({ status: "ok", service: "shieldgive-backend", persistence });
  } catch {
    res.status(503).json({ status: "not-ready", service: "shieldgive-backend" });
  }
});

app.use("/api", apiRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

async function main(): Promise<void> {
  // Refuse to start in production without a configured durable database.
  await storage.initialize();
  await storage.addAgentLog("info", "Backend storage initialized", {
    persistence: await storage.getStorageMode(),
  });

  const server = app.listen(PORT, () => {
    console.log(`\nShieldGive backend listening on port ${PORT}`);
    console.log("Health: GET /health");
    console.log("Agent status: GET /api/agent/status");
  });

  await startAgent();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}; shutting down ShieldGive`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await storage.close();
  };
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
}

main().catch((error) => {
  console.error("ShieldGive startup failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
