import { Router } from "express";
import { z } from "zod";
import { storage } from "../services/storage.js";
import { zcashWatcher } from "../services/zcashWatcher.js";
import { processIncomingTx } from "../agent/pipeline.js";

const router = Router();

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

router.get("/campaign", (_req, res) => {
  res.json({
    success: true,
    data: storage.getCampaign(),
  });
});

// ---------------------------------------------------------------------------
// Donor registration
// ---------------------------------------------------------------------------

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
    });

    res.status(201).json({
      success: true,
      data: registration,
    });
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
  res.json({
    success: true,
    data: storage.getDonors(),
  });
});

// ---------------------------------------------------------------------------
// Donations & Gallery
// ---------------------------------------------------------------------------

router.get("/donations", (_req, res) => {
  res.json({
    success: true,
    data: storage.getDonations(),
  });
});

// ---------------------------------------------------------------------------
// Agent logs & status (for demo dashboard)
// ---------------------------------------------------------------------------

router.get("/agent/logs", (req, res) => {
  const limit = Math.min(100, parseInt(String(req.query.limit || "40"), 10));
  res.json({
    success: true,
    data: storage.getAgentLogs(limit),
  });
});

router.get("/agent/status", (_req, res) => {
  res.json({
    success: true,
    data: {
      mockZcash: zcashWatcher.isMockMode(),
      mockSolana: process.env.SOLANA_PRIVATE_KEY === "mock" || !process.env.SOLANA_PRIVATE_KEY,
      pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || "30", 10),
      totalDonations: storage.getDonations().length,
      registeredDonors: storage.getDonors().length,
    },
  });
});

// ---------------------------------------------------------------------------
// Demo helpers — simulate a shielded donation
// ---------------------------------------------------------------------------

const simulateSchema = z.object({
  amountZEC: z.number().positive().max(1000),
  memo: z.string().max(200).optional(),
});

router.post("/agent/simulate", async (req, res) => {
  try {
    const body = simulateSchema.parse(req.body);
    const tx = await zcashWatcher.simulateIncomingDonation(body.amountZEC, {
      memo: body.memo,
    });

    // Immediately process through the same pipeline the cron job uses
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
