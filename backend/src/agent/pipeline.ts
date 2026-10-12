import { storage } from "../services/storage.js";
import { zcashWatcher, type IncomingShieldedTx } from "../services/zcashWatcher.js";
import { solanaMinter } from "../services/solanaMinter.js";
import { createCrossL1Receipt } from "../services/crossL1Receipt.js";

/**
 * Deterministic donation pipeline. PostgreSQL's unique source-tx constraint
 * and conditional "validated -> minting" update coordinate competing workers.
 * A live mint with an ambiguous RPC outcome is quarantined for reconciliation,
 * never blindly retried.
 */
function donorIdFromMemo(memo?: string): string | undefined {
  if (!memo) return undefined;
  const match = memo.match(/(?:shieldgive[:\s]+)?donor[=:]([a-zA-Z0-9_-]+)/i);
  return match?.[1];
}

const terminalOrUncertain = new Set(["minted", "minting", "mint_unknown"]);

async function processIncomingTxInternal(tx: IncomingShieldedTx): Promise<void> {
  if (await storage.isTxProcessed(tx.txId)) {
    await storage.addAgentLog("info", "Skipping successfully processed tx", { txId: tx.txId });
    return;
  }

  const existing = await storage.findDonationByTxId(tx.txId);
  if (existing && terminalOrUncertain.has(existing.status)) {
    if (existing.status === "minted") await storage.markTxProcessed(tx.txId);
    await storage.addAgentLog("warn", "Transaction not reprocessed because its proof is already minted or requires reconciliation", {
      txId: tx.txId,
      donationId: existing.id,
      status: existing.status,
    });
    return;
  }

  await storage.addAgentLog("info", "New shielded transaction detected", {
    txId: tx.txId,
    amountZEC: tx.amountZEC,
  });

  const donorId = donorIdFromMemo(tx.memo);
  const donor = donorId ? await storage.findDonorById(donorId) : undefined;
  const donation = await storage.getOrCreateDonation({
    txId: tx.txId,
    amountZEC: tx.amountZEC,
    detectedAt: tx.receivedAt || new Date().toISOString(),
    status: "pending",
    solanaWallet: donor?.solanaWallet,
  });

  // Another worker may have created or advanced the record after the first read.
  if (terminalOrUncertain.has(donation.status)) {
    if (donation.status === "minted") await storage.markTxProcessed(tx.txId);
    await storage.addAgentLog("warn", "Concurrent worker already owns this donation", {
      txId: tx.txId,
      donationId: donation.id,
      status: donation.status,
    });
    return;
  }

  if (!donor) {
    await storage.updateDonation(donation.id, {
      status: "failed",
      error: donorId
        ? "Donation memo did not match a registered donor"
        : "Donation memo missing ShieldGive donor code",
    });
    await storage.addAgentLog(
      "warn",
      "Payment detected but donor correlation failed — NFT not minted",
      { txId: tx.txId, donationId: donation.id, memo: tx.memo },
    );
    return;
  }

  if (!Number.isFinite(tx.amountZEC) || tx.amountZEC <= 0) {
    await storage.updateDonation(donation.id, { status: "failed", error: "Invalid amount" });
    await storage.addAgentLog("error", "Invalid donation amount", {
      txId: tx.txId,
      amountZEC: tx.amountZEC,
    });
    return;
  }

  const crossL1Receipt = createCrossL1Receipt({
    sourceTxId: tx.txId,
    donationId: donation.id,
    amountZEC: tx.amountZEC,
    solanaWallet: donor.solanaWallet,
    createdAt: donation.detectedAt,
  });

  const prepared = await storage.markDonationValidated(
    donation.id,
    crossL1Receipt,
    donor.solanaWallet,
  );
  if (!prepared) {
    await storage.addAgentLog("warn", "Donation state changed before validation; refusing duplicate mint", {
      txId: tx.txId,
      donationId: donation.id,
    });
    return;
  }

  const claimed = await storage.claimDonationMint(donation.id);
  if (!claimed) {
    await storage.addAgentLog("info", "Another worker claimed the mint; duplicate request skipped", {
      txId: tx.txId,
      donationId: donation.id,
    });
    return;
  }

  await storage.addAgentLog("success", "Cross-L1 donation receipt created", {
    receiptId: crossL1Receipt.receiptId,
    sourceChain: crossL1Receipt.sourceChain,
    destinationChain: crossL1Receipt.destinationChain,
    sourceTxId: tx.txId,
    donationId: donation.id,
  });
  await storage.addAgentLog("success", "Payment validated", {
    donationId: donation.id,
    solanaWallet: donor.solanaWallet,
    donorId: donor.id,
  });

  try {
    const mintResult = await solanaMinter.mintDonationProof({
      recipientWallet: donor.solanaWallet,
      amountZEC: tx.amountZEC,
      donationId: donation.id,
      txId: tx.txId,
    });

    if (mintResult.success && mintResult.mintAddress) {
      const completedReceipt = {
        ...crossL1Receipt,
        status: "solana_proof_minted" as const,
        solanaMintAddress: mintResult.mintAddress,
      };
      await storage.updateDonation(donation.id, {
        status: "minted",
        nftMintAddress: mintResult.mintAddress,
        nftMintSignature: mintResult.signature,
        crossL1Receipt: completedReceipt,
        error: undefined,
      });
      await storage.markTxProcessed(tx.txId);
      const campaign = await storage.getCampaign();
      await storage.addAgentLog(
        "success",
        "Donation proof NFT minted & cross-L1 receipt completed",
        {
          donationId: donation.id,
          receiptId: completedReceipt.receiptId,
          mintAddress: mintResult.mintAddress,
          totalRaisedZEC: campaign.totalRaisedZEC,
        },
      );
      return;
    }

    const uncertain = mintResult.outcomeUnknown === true;
    await storage.updateDonation(donation.id, {
      status: uncertain ? "mint_unknown" : "failed",
      crossL1Receipt: {
        ...crossL1Receipt,
        status: uncertain ? "mint_outcome_unknown" : "failed",
      },
      error: uncertain
        ? `Mint submission outcome is uncertain: ${mintResult.error || "RPC did not confirm the result"}. Do not retry until the Solana chain is reconciled.`
        : mintResult.error || "Mint failed before submission; a controlled retry may be possible",
    });
    await storage.addAgentLog(uncertain ? "error" : "warn",
      uncertain
        ? "Solana mint outcome uncertain — manual on-chain reconciliation required; automatic retry blocked"
        : "NFT mint failed before a confirmed submission — transaction remains retryable",
      {
        txId: tx.txId,
        donationId: donation.id,
        receiptId: crossL1Receipt.receiptId,
        error: mintResult.error,
        outcomeUnknown: uncertain,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const uncertain = !solanaMinter.isMockMode() && solanaMinter.isLiveMintEnabled();
    await storage.updateDonation(donation.id, {
      status: uncertain ? "mint_unknown" : "failed",
      crossL1Receipt: {
        ...crossL1Receipt,
        status: uncertain ? "mint_outcome_unknown" : "failed",
      },
      error: uncertain
        ? `Unexpected mint error with uncertain on-chain outcome: ${message}. Reconcile before retrying.`
        : message,
    });
    await storage.addAgentLog("error",
      uncertain
        ? "Unexpected live mint error — automatic retry blocked pending reconciliation"
        : "NFT mint failed; transaction remains retryable",
      { txId: tx.txId, donationId: donation.id, receiptId: crossL1Receipt.receiptId, error: message },
    );
  }
}

const processingTxIds = new Set<string>();

/** In-process guard complements the persistent PostgreSQL mint claim. */
export async function processIncomingTx(tx: IncomingShieldedTx): Promise<void> {
  if (processingTxIds.has(tx.txId)) {
    await storage.addAgentLog("warn", "Skipping duplicate in-flight transaction", { txId: tx.txId });
    return;
  }

  const existing = await storage.findDonationByTxId(tx.txId);
  if (existing && terminalOrUncertain.has(existing.status)) {
    if (existing.status === "minted") await storage.markTxProcessed(tx.txId);
    await storage.addAgentLog("info", "Skipping existing donation that is minted or awaiting reconciliation", {
      txId: tx.txId,
      donationId: existing.id,
      status: existing.status,
    });
    return;
  }

  processingTxIds.add(tx.txId);
  try {
    await processIncomingTxInternal(tx);
  } finally {
    processingTxIds.delete(tx.txId);
  }
}

let tickRunning = false;

/** Single local agent tick. Multiple service instances are safe at the mint claim. */
export async function agentTick(): Promise<void> {
  if (tickRunning) {
    await storage.addAgentLog("info", "Agent tick skipped — previous tick still running");
    return;
  }

  tickRunning = true;
  await storage.addAgentLog("info", "Agent tick — polling for new shielded transactions");
  try {
    const incoming = await zcashWatcher.pollIncoming();
    if (incoming.length === 0) {
      await storage.addAgentLog("info", "No new transactions found this cycle");
      return;
    }
    for (const tx of incoming) await processIncomingTx(tx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await storage.addAgentLog("error", "Agent tick failed", { error: message });
  } finally {
    tickRunning = false;
  }
}
