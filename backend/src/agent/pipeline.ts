import { storage } from "../services/storage.js";
import { zcashWatcher, type IncomingShieldedTx } from "../services/zcashWatcher.js";
import { solanaMinter } from "../services/solanaMinter.js";
import { createCrossL1Receipt } from "../services/crossL1Receipt.js";

/**
 * Core agent pipeline — deterministic, no LLM reasoning.
 *
 * Fixed sequence:
 *   1. Poll (or receive) new shielded transactions
 *   2. Skip transactions that already completed successfully
 *   3. Correlate the payment to a registered donor using the private memo code
 *   4. Validate basic constraints
 *   5. Create a cross-L1 receipt binding the Zcash event to the donor's Solana wallet
 *   6. Mint NFT proof using the existing Solana integration
 *   7. Update campaign totals + agent log
 *
 * The cross-L1 receipt is proof metadata only. It never moves funds between chains.
 */
function donorIdFromMemo(memo?: string): string | undefined {
  if (!memo) return undefined;
  const match = memo.match(/(?:shieldgive[:\s]+)?donor[=:]([a-zA-Z0-9_-]+)/i);
  return match?.[1];
}

export async function processIncomingTx(tx: IncomingShieldedTx): Promise<void> {
  if (storage.isTxProcessed(tx.txId)) {
    storage.addAgentLog("info", "Skipping successfully processed tx", {
      txId: tx.txId,
    });
    return;
  }

  storage.addAgentLog("info", "New shielded transaction detected", {
    txId: tx.txId,
    amountZEC: tx.amountZEC,
  });

  const donorId = donorIdFromMemo(tx.memo);
  const donor = donorId
    ? storage.getDonors().find((d) => d.id === donorId)
    : undefined;

  const donation = storage.addDonation({
    txId: tx.txId,
    amountZEC: tx.amountZEC,
    detectedAt: tx.receivedAt || new Date().toISOString(),
    status: "pending",
    solanaWallet: donor?.solanaWallet,
  });

  if (!donor) {
    storage.updateDonation(donation.id, {
      status: "failed",
      error: donorId
        ? "Donation memo did not match a registered donor"
        : "Donation memo missing ShieldGive donor code",
    });
    storage.addAgentLog(
      "warn",
      "Payment detected but donor correlation failed — NFT not minted",
      { txId: tx.txId, donationId: donation.id, memo: tx.memo }
    );
    return;
  }

  if (tx.amountZEC <= 0) {
    storage.updateDonation(donation.id, {
      status: "failed",
      error: "Invalid amount",
    });
    storage.addAgentLog("error", "Invalid donation amount", {
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

  storage.updateDonation(donation.id, {
    status: "validated",
    crossL1Receipt,
  });
  storage.addAgentLog("success", "Cross-L1 donation receipt created", {
    receiptId: crossL1Receipt.receiptId,
    sourceChain: crossL1Receipt.sourceChain,
    destinationChain: crossL1Receipt.destinationChain,
    sourceTxId: tx.txId,
    donationId: donation.id,
  });
  storage.addAgentLog("success", "Payment validated", {
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

    if (mintResult.success) {
      const completedReceipt = {
        ...crossL1Receipt,
        status: "solana_proof_minted" as const,
        solanaMintAddress: mintResult.mintAddress,
      };

      storage.updateDonation(donation.id, {
        status: "minted",
        nftMintAddress: mintResult.mintAddress,
        crossL1Receipt: completedReceipt,
      });
      storage.recordRaised(tx.amountZEC);
      storage.markTxProcessed(tx.txId);
      storage.addAgentLog(
        "success",
        "Donation proof NFT minted & cross-L1 receipt completed",
        {
          donationId: donation.id,
          receiptId: completedReceipt.receiptId,
          mintAddress: mintResult.mintAddress,
          totalRaisedZEC: storage.getCampaign().totalRaisedZEC,
        }
      );
      return;
    }

    storage.updateDonation(donation.id, {
      status: "failed",
      crossL1Receipt: {
        ...crossL1Receipt,
        status: "failed",
      },
      error: mintResult.error || "Mint failed — will retry",
    });
    storage.addAgentLog("warn", "NFT mint failed — transaction remains retryable", {
      txId: tx.txId,
      donationId: donation.id,
      receiptId: crossL1Receipt.receiptId,
      error: mintResult.error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    storage.updateDonation(donation.id, {
      status: "failed",
      crossL1Receipt: {
        ...crossL1Receipt,
        status: "failed",
      },
      error: `${message} — will retry`,
    });
    storage.addAgentLog("warn", "NFT mint threw an error — transaction remains retryable", {
      txId: tx.txId,
      donationId: donation.id,
      receiptId: crossL1Receipt.receiptId,
      error: message,
    });
  }
}

let tickRunning = false;

/** Single agent tick — called by the cron scheduler. */
export async function agentTick(): Promise<void> {
  if (tickRunning) {
    storage.addAgentLog("info", "Agent tick skipped — previous tick still running");
    return;
  }

  tickRunning = true;
  storage.addAgentLog("info", "Agent tick — polling for new shielded transactions");

  try {
    const incoming = await zcashWatcher.pollIncoming();

    if (incoming.length === 0) {
      storage.addAgentLog("info", "No new transactions found this cycle");
      return;
    }

    for (const tx of incoming) {
      await processIncomingTx(tx);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    storage.addAgentLog("error", "Agent tick failed", { error: message });
  } finally {
    tickRunning = false;
  }
}
