import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { storage } from "../services/storage.js";
import { zcashWatcher } from "../services/zcashWatcher.js";
import { processIncomingTx } from "../agent/pipeline.js";
import { solanaMinter } from "../services/solanaMinter.js";

const router = Router();

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

router.get("/campaign", asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await storage.getCampaign() });
}));

const registerSchema = z.object({
  solanaWallet: z.string().min(32).max(64),
  note: z.string().max(200).optional(),
});

router.post("/register", asyncHandler(async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    const registration = await storage.registerDonor(body.solanaWallet, body.note);
    await storage.addAgentLog("info", "Donor wallet registered", {
      solanaWallet: registration.solanaWallet,
      donorId: registration.id,
    });
    res.status(201).json({ success: true, data: registration });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.flatten() });
      return;
    }
    throw err;
  }
}));

router.get("/donors", asyncHandler(async (_req, res) => {
  const donors = await storage.getDonors();
  // Public production responses must not expose donor wallet addresses or notes.
  const data = process.env.NODE_ENV === "production"
    ? donors.map(({ id, registeredAt }) => ({ id, registeredAt }))
    : donors;
  res.json({ success: true, data });
}));

router.get("/donations", asyncHandler(async (_req, res) => {
  const donations = await storage.getDonations();
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
}));

router.get("/cross-l1/receipts", asyncHandler(async (_req, res) => {
  const donations = await storage.getDonations();
  const receipts = donations
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
}));

router.get("/agent/logs", asyncHandler(async (req, res) => {
  const parsedLimit = Number.parseInt(String(req.query.limit || "40"), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 40;
  const logs = await storage.getAgentLogs(limit);
  // Raw metadata can contain wallet addresses, transaction IDs, and private memos.
  const data = process.env.NODE_ENV === "production"
    ? logs.map(({ id, timestamp, level, message }) => ({ id, timestamp, level, message }))
    : logs;
  res.json({ success: true, data });
}));

router.get("/agent/status", asyncHandler(async (_req, res) => {
  const [campaign, donations, donors, storageMode, reconciliationRequired] = await Promise.all([
    storage.getCampaign(),
    storage.getDonations(),
    storage.getDonors(),
    storage.getStorageMode(),
    storage.getReconciliationRequiredCount(),
  ]);
  res.json({
    success: true,
    data: {
      mockZcash: zcashWatcher.isMockMode(),
      mockSolana: solanaMinter.isMockMode(),
      liveSolanaMintEnabled: solanaMinter.isLiveMintEnabled(),
      persistence: storageMode,
      reconciliationRequired,
      pollIntervalSeconds: Number.parseInt(process.env.POLL_INTERVAL_SECONDS || "30", 10),
      totalDonations: donations.length,
      registeredDonors: donors.length,
      totalRaisedZEC: campaign.totalRaisedZEC,
      crossL1: {
        enabled: true,
        model: "proof-only",
        sourceChain: "zcash",
        destinationChain: "solana",
        fundsMovedAcrossChains: false,
      },
    },
  });
}));

const simulateSchema = z.object({
  amountZEC: z.number().positive().max(1000),
  memo: z.string().max(200).optional(),
});

router.post("/agent/simulate", asyncHandler(async (req, res) => {
  if (
    process.env.NODE_ENV === "production" ||
    !zcashWatcher.isMockMode() ||
    !solanaMinter.isMockMode()
  ) {
    res.status(403).json({
      success: false,
      error: "Simulation endpoint is disabled while a live chain integration is active",
    });
    return;
  }

  let body: z.infer<typeof simulateSchema>;
  try {
    body = simulateSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.flatten() });
      return;
    }
    throw err;
  }

  const tx = await zcashWatcher.simulateIncomingDonation(body.amountZEC, { memo: body.memo });
  await processIncomingTx(tx);
  res.status(201).json({
    success: true,
    data: {
      txId: tx.txId,
      amountZEC: tx.amountZEC,
      message: "Simulated donation processed through the agent pipeline",
    },
  });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[ShieldGive API]", message);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
