import { Router } from "express";
import { z } from "zod";
import { storage } from "../services/storage.js";
import { zcashWatcher } from "../services/zcashWatcher.js";
import { processIncomingTx } from "../agent/pipeline.js";
import { solanaMinter } from "../services/solanaMinter.js";

const router = Router();

router.get("/campaign", (_req, res) => {
  res.json({ success: true, data: storage.getCampaign() });
});

const registerSchema = z.object({
  solanaWallet: z.string().min(32).max(64),
  note: z.string().max(200).optional(),
});

router.post("/register", (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    const registration = storage.registerDonor(body.solanaWallet, body.note);

    storage.addAgentLog("info", "Donor wallet registered", {
      solanaWallet: registration.solanaWallet,
      donorId: registration.id,
    });

    res.status(201).json({ success: true, data: registration });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.flatten() });
      return;
    }
    const message = err instanceof Error ? err.message : "Registration failed";
    res.status(400).json({ success: false, error: message });
  }
});

router.get("/donors", (_req, res) => {
  // Public production responses must not expose donor wallet addresses or notes.
  const donors = storage.getDonors();
  const data = process.env.NODE_ENV === "production"
    ? donors.map(({ id, registeredAt }) => ({ id, registeredAt }))
    : donors;
  res.json({ success: true, data });
});

router.get("/donations", (_req, res) => {
  const donations = storage.getDonations();
  // Never publish the private cross-chain linkage fields from the raw store.
  const data = process.env.NODE_ENV === "production"
    ? donations.map((donation) => ({
        id: donation.id,
        amountZEC: donation.amountZEC,
        detectedAt: donation.detectedAt,
        status: donation.status,
        nftMintAddress: donation.nftMintAddress,
      }))
    : donations;
  res.json({ success: true, data });
});

router.get("/cross-l1/receipts", (_req, res) => {
  const receipts = storage
    .getDonations()
    .filter((donation) => donation.crossL1Receipt)
    .map((donation) => donation.crossL1Receipt)
    .filter((receipt) => receipt !== undefined)
    .map((receipt) => {
      if (process.env.NODE_ENV !== "production") return receipt;
      // Do not publicly correlate a shielded Zcash transaction with a Solana wallet.
      return {
        receiptId: receipt.receiptId,
        sourceChain: receipt.sourceChain,
        destinationChain: receipt.destinationChain,
        amountZEC: receipt.amountZEC,
        createdAt: receipt.createdAt,
        status: receipt.status,
        solanaMintAddress: receipt.solanaMintAddress,
      };
    });

  res.json({
    success: true,
    data: {
      model: "proof-only",
      fundsMovedAcrossChains: false,
      sourceChain: "zcash",
      destinationChain: "solana",
      receipts,
    },
  });
});

router.get("/agent/logs", (req, res) => {
  const parsedLimit = parseInt(String(req.query.limit || "40"), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 40;
  const logs = storage.getAgentLogs(limit);
  // Raw metadata can contain wallet addresses, transaction IDs, and private memos.
  const data = process.env.NODE_ENV === "production"
    ? logs.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
      }))
    : logs;
  res.json({ success: true, data });
});

router.get("/agent/status", (_req, res) => {
  res.json({
    success: true,
    data: {
      mockZcash: zcashWatcher.isMockMode(),
      mockSolana:
        process.env.SOLANA_PRIVATE_KEY === "mock" ||
        !process.env.SOLANA_PRIVATE_KEY,
      liveSolanaMintEnabled: solanaMinter.isLiveMintEnabled(),
      pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || "30", 10),
      totalDonations: storage.getDonations().length,
      registeredDonors: storage.getDonors().length,
      crossL1: {
        enabled: true,
        model: "proof-only",
        sourceChain: "zcash",
        destinationChain: "solana",
        fundsMovedAcrossChains: false,
      },
    },
  });
});

const simulateSchema = z.object({
  amountZEC: z.number().positive().max(1000),
  memo: z.string().max(200).optional(),
});

router.post("/agent/simulate", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production" || !zcashWatcher.isMockMode() || !solanaMinter.isMockMode()) {
      res.status(403).json({
        success: false,
        error: "Simulation endpoint is disabled while a live chain integration is active",
      });
      return;
    }
    const body = simulateSchema.parse(req.body);
    const tx = await zcashWatcher.simulateIncomingDonation(body.amountZEC, {
      memo: body.memo,
    });

    await processIncomingTx(tx);

    res.status(201).json({
      success: true,
      data: {
        txId: tx.txId,
        amountZEC: tx.amountZEC,
        message: "Simulated donation processed through the agent pipeline",
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.flatten() });
      return;
    }
    const message = err instanceof Error ? err.message : "Simulation failed";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
