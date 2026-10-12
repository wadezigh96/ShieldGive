import { Router, type Request, type Response, type NextFunction } from "express";
import { createPublicKey, verify as verifyEd25519 } from "node:crypto";
import bs58 from "bs58";
import { z } from "zod";
import { storage } from "../services/storage.js";
import { zcashWatcher } from "../services/zcashWatcher.js";
import { processIncomingTx } from "../agent/pipeline.js";
import { solanaMinter } from "../services/solanaMinter.js";

const router = Router();

function isSolanaWallet(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

function verifySolanaMessage(wallet: string, message: string, signatureBase64: string): boolean {
  try {
    const publicKeyBytes = bs58.decode(wallet);
    const signature = Buffer.from(signatureBase64, "base64");
    if (publicKeyBytes.length !== 32 || signature.length !== 64) return false;
    // Ed25519 SubjectPublicKeyInfo prefix followed by the raw 32-byte Solana key.
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const publicKey = createPublicKey({
      key: Buffer.concat([spkiPrefix, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    return verifyEd25519(null, Buffer.from(message, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}

function bearerToken(req: Request): string | undefined {
  const match = req.header("authorization")?.match(/^Bearer\s+([A-Za-z0-9_-]{30,200})$/);
  return match?.[1];
}

async function authenticatedWallet(req: Request): Promise<string | undefined> {
  const token = bearerToken(req);
  return token ? storage.getWalletForSession(token) : undefined;
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

router.post("/wallet/challenge", asyncHandler(async (req, res) => {
  const schema = z.object({ solanaWallet: z.string().min(32).max(44) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !isSolanaWallet(parsed.data?.solanaWallet ?? "")) {
    res.status(400).json({ success: false, error: "A valid Solana wallet address is required" });
    return;
  }
  const challenge = await storage.createWalletChallenge(parsed.data.solanaWallet);
  res.status(201).json({
    success: true,
    data: {
      challengeId: challenge.id,
      solanaWallet: challenge.solanaWallet,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
    },
  });
}));

router.post("/wallet/session", asyncHandler(async (req, res) => {
  const schema = z.object({
    solanaWallet: z.string().min(32).max(44),
    challengeId: z.string().uuid(),
    message: z.string().min(1).max(2048),
    signature: z.string().min(80).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !isSolanaWallet(parsed.data?.solanaWallet ?? "")) {
    res.status(400).json({ success: false, error: "Invalid wallet challenge payload" });
    return;
  }
  const body = parsed.data;
  const challenge = await storage.getWalletChallenge(body.challengeId);
  if (!challenge ||
      challenge.solanaWallet !== body.solanaWallet ||
      challenge.message !== body.message) {
    res.status(401).json({ success: false, error: "Wallet challenge is invalid, expired, or already used" });
    return;
  }
  if (!verifySolanaMessage(body.solanaWallet, body.message, body.signature)) {
    res.status(401).json({ success: false, error: "Solana wallet signature is invalid" });
    return;
  }
  const consumed = await storage.consumeWalletChallenge(
    challenge.id,
    body.solanaWallet,
    body.message,
  );
  if (!consumed) {
    res.status(401).json({ success: false, error: "Wallet challenge has already been consumed or expired" });
    return;
  }
  const session = await storage.createWalletSession(body.solanaWallet);
  res.status(201).json({
    success: true,
    data: {
      solanaWallet: body.solanaWallet,
      token: session.token,
      expiresAt: session.expiresAt,
    },
  });
}));

router.get("/donations/mine", asyncHandler(async (req, res) => {
  const wallet = await authenticatedWallet(req);
  if (!wallet) {
    res.status(401).json({ success: false, error: "Verify wallet ownership to access private donation status" });
    return;
  }
  res.json({ success: true, data: await storage.getDonationsByWallet(wallet) });
}));

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
    const sessionWallet = await authenticatedWallet(req);
    if (!sessionWallet) {
      res.status(401).json({ success: false, error: "Verify Solana wallet ownership before registering" });
      return;
    }
    if (sessionWallet !== body.solanaWallet.trim()) {
      res.status(403).json({ success: false, error: "Verified wallet does not match the registration wallet" });
      return;
    }
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
  // Public gallery shows completed proof objects only: never expose pending
  // donor activity, donation amount/time, wallet, Zcash tx ID, or signature.
  const data = process.env.NODE_ENV === "production"
    ? donations
        .filter((donation) => donation.status === "minted" && donation.nftMintAddress)
        .map((donation) => ({
          id: donation.id,
          status: donation.status,
          nftMintAddress: donation.nftMintAddress,
        }))
    : donations;
  res.json({ success: true, data });
}));

router.get("/cross-l1/receipts", asyncHandler(async (_req, res) => {
  const donations = await storage.getDonations();
  const receipts = donations
    .filter((donation) =>
      donation.crossL1Receipt &&
      (process.env.NODE_ENV !== "production" || donation.status === "minted"),
    )
    .map((donation) => donation.crossL1Receipt)
    .filter((receipt) => receipt !== undefined)
    .map((receipt) => {
      if (process.env.NODE_ENV !== "production") return receipt;
      // The public receipt carries no amount, exact timestamp, transaction ID,
      // donor wallet, or donation ID. It is only a link to the on-chain proof.
      return {
        receiptId: receipt.receiptId,
        sourceChain: receipt.sourceChain,
        destinationChain: receipt.destinationChain,
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
