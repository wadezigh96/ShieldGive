import { storage } from "../services/storage.js";
import { zcashWatcher, type IncomingShieldedTx } from "../services/zcashWatcher.js";
import { solanaMinter } from "../services/solanaMinter.js";

/**
 * Core agent pipeline — deterministic, no LLM reasoning.
 *
 * Fixed sequence:
 *   1. Poll (or receive) new shielded transactions
 *   2. Skip already-processed txids
 *   3. Correlate the payment to a registered donor using the private memo code
 *   4. Validate basic constraints
 *   5. Mint NFT proof
 *   6. Update campaign totals + agent log
 *
 * The memo correlation is intentional: the previous "latest donor" heuristic
 * could send Alice's proof to Bob when multiple donors were registered.
 */
function donorIdFromMemo(memo?: string): string | undefined {
  if (!memo) return undefined;
  const match = memo.match(/(?:shieldgive[:\s]+)?donor[=:]([a-zA-Z0-9_-]+)/i);
  return match?.[1];
}

export async function processIncomingTx(
  tx: IncomingShieldedTx
): Promise<void> {
  if (storage.isTxProcessed(tx.txId)) {
    storage.addAgentLog("info", "Skipping already-processed tx", {
      txId: tx.txId,
    });
    return;
  }

  storage.markTxProcessed(tx.txId);

  storage.addAgentLog("info", "New shielded transaction detected", {
    txId: tx.txId,
    amountZEC: tx.amountZEC,
  });

  const donorId = donorIdFromMemo(tx.memo);
  const donor = donorId ? storage.getDonors().find((d) => d.id === donorId) : undefined;

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

  storage.updateDonation(donation.id, { status: "validated" });
  storage.addAgentLog("success", "Payment validated", {
    donationId: donation.id,
    solanaWallet: donor.solanaWallet,
    donorId: donor.id,
  });

  const mintResult = await solanaMinter.mintDonationProof({
    recipientWallet: donor.solanaWallet,
    amountZEC: tx.amountZEC,
    donationId: donation.id,
    txId: tx.txId,
  });

  if (mintResult.success) {
    storage.updateDonation(donation.id, {
      status: "minted",
      nftMintAddress: mintResult.mintAddress,
    });
    storage.recordRaised(tx.amountZEC);
    storage.addAgentLog("success", "Donation proof NFT minted & campaign updated", {
      donationId: donation.id,
      mintAddress: mintResult.mintAddress,
      totalRaisedZEC: storage.getCampaign().totalRaisedZEC,
    });
  } else {
    storage.updateDonation(donation.id, {
      status: "failed",
      error: mintResult.error || "Mint failed",
    });
    storage.addAgentLog("error", "NFT mint failed", {
      donationId: donation.id,
      error: mintResult.error,
    });
  }
}

/** Single agent tick — called by the cron scheduler. */
export async function agentTick(): Promise<void> {
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
  }
}
