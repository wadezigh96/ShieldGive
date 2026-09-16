import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRouter from "./routes/api.js";
import { startAgent } from "./agent/scheduler.js";
import { storage } from "./services/storage.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "shieldgive-backend" });
});

app.use("/api", apiRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`\n🛡️  ShieldGive backend listening on http://localhost:${PORT}`);
  console.log(`   Agent dashboard data: GET /api/agent/logs`);
  console.log(`   Simulate donation:   POST /api/agent/simulate\n`);

  storage.addAgentLog("info", "Backend started", { port: PORT });
  startAgent();
});
