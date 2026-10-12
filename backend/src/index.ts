import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRouter from "./routes/api.js";
import { startAgent } from "./agent/scheduler.js";
import { storage } from "./services/storage.js";
import { zcashWatcher } from "./services/zcashWatcher.js";
import { solanaMinter } from "./services/solanaMinter.js";

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

function validateProductionConfiguration(): void {
  if (process.env.NODE_ENV !== "production") return;

  const problems: string[] = [];
  if (zcashWatcher.isMockMode()) {
    problems.push("configure ZCASH_RPC_URL and a real CAMPAIGN_SHIELDED_ADDRESS");
  }
  if (!process.env.CAMPAIGN_SHIELDED_ADDRESS ||
      /demo|placeholder|\.\.\./i.test(process.env.CAMPAIGN_SHIELDED_ADDRESS)) {
    problems.push("replace the sample campaign shielded address");
  }
  if (solanaMinter.isMockMode()) {
    problems.push("configure a real SOLANA_PRIVATE_KEY and SOLANA_MODE=live");
  }
  if (process.env.SOLANA_LIVE_MINT_ENABLED !== "true") {
    problems.push("set SOLANA_LIVE_MINT_ENABLED=true only after reviewing the mint configuration");
  }
  if (!process.env.SOLANA_NFT_METADATA_URI) {
    problems.push("configure SOLANA_NFT_METADATA_URI");
  } else {
    try {
      if (new URL(process.env.SOLANA_NFT_METADATA_URI).protocol !== "https:") {
        problems.push("SOLANA_NFT_METADATA_URI must use HTTPS");
      }
    } catch {
      problems.push("SOLANA_NFT_METADATA_URI must be a valid HTTPS URL");
    }
  }
  const network = process.env.SOLANA_NETWORK;
  const rpc = process.env.SOLANA_RPC_URL || "";
  if (!rpc) problems.push("set SOLANA_RPC_URL explicitly for the selected network");
  if (network !== "devnet" && network !== "mainnet-beta") {
    problems.push("set SOLANA_NETWORK explicitly to devnet or mainnet-beta");
  } else if (network === "devnet" && /mainnet/i.test(rpc)) {
    problems.push("SOLANA_NETWORK=devnet conflicts with the configured mainnet RPC");
  } else if (network === "mainnet-beta" && /devnet/i.test(rpc)) {
    problems.push("SOLANA_NETWORK=mainnet-beta conflicts with the configured Devnet RPC");
  }
  if (
    network === "mainnet-beta" &&
    process.env.SOLANA_MAINNET_LIVE_MINT_ACK !== "I_UNDERSTAND_MAINNET_MINTING"
  ) {
    problems.push("mainnet minting requires the explicit SOLANA_MAINNET_LIVE_MINT_ACK acknowledgement");
  }

  if (problems.length) {
    throw new Error(
      `Production configuration is incomplete; refusing to start a demo or unsafe agent: ${problems.join("; ")}`,
    );
  }
}

async function main(): Promise<void> {
  // Validate external-chain configuration before opening database sockets.
  // Durable storage is also a hard requirement and never falls back to RAM in production.
  validateProductionConfiguration();
  await storage.initialize();
  await storage.addAgentLog("info", "Backend storage initialized", {
    persistence: await storage.getStorageMode(),
    liveZcash: !zcashWatcher.isMockMode(),
    liveSolana: !solanaMinter.isMockMode(),
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
