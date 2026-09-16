import { storage } from "../services/storage.js";
import { zcashWatcher, type IncomingShieldedTx } from "../services/zcashWatcher.js";
import { solanaMinter } from "../services/solanaMinter.js";

/**
 * Core agent pipeline — deterministic, no LLM reasoning.
 *
 * Fixed sequence:
 *   1. Poll (or receive) new shielded transactions
 *   2. Skip already-processed txids
 *   3. Attach a registered Solana wallet (demo heuristic: latest donor)
 *   4. Validate basic constraints
 *   5. Mint NFT proof
 *   6. Update campaign totals + agent log
 */
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

  // Demo heuristic: assign the most recently registered donor.
  // In a production multi-donor system you would match via memo,
  // unique payment address, or a short registration code.
  const donor = storage.getLatestDonor();

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
      error: "No registered Solana wallet found",
    });
    storage.addAgentLog(
      "warn",
      "Payment detected but no Solana wallet registered yet — NFT not minted",
      { txId: tx.txId, donationId: donation.id }
    );
    // Still count the funds for the gallery
    storage.recordRaised(tx.amountZEC);
    return;
  }

  // Basic validation
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
  });

  // Mint
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

/**
 * Single agent tick — called by the cron scheduler.
 */
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
