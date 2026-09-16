import { storage } from "./storage.js";

export interface IncomingShieldedTx {
  txId: string;
  amountZEC: number;
  blockHeight?: number;
  memo?: string;
  receivedAt: string;
}

/**
 * Zcash shielded transaction watcher.
 *
 * Production path:
 *   - Use a viewing key with lightwalletd / zcashd RPC
 *   - or a dedicated light client that can decrypt incoming notes
 *   - Filter for notes arriving at the campaign shielded address
 *
 * For the hackathon MVP we provide a clean mock that can be
 * triggered via API or by the agent itself for demo purposes.
 */
export class ZcashWatcher {
  private mockMode: boolean;

  constructor() {
    this.mockMode =
      !process.env.ZCASH_VIEWING_KEY ||
      process.env.ZCASH_VIEWING_KEY === "mock";
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Poll for new incoming shielded transactions.
   * In mock mode this returns an empty list unless a simulated
   * donation has been injected via `simulateIncomingDonation`.
   */
  async pollIncoming(): Promise<IncomingShieldedTx[]> {
    if (this.mockMode) {
      // In mock mode the agent does not invent donations.
      // Use the /api/agent/simulate endpoint (or the dashboard button)
      // to inject a realistic payment for the demo.
      return [];
    }

    // ------------------------------------------------------------------
    // TODO: Real implementation
    // ------------------------------------------------------------------
    // 1. Connect to lightwalletd or zcashd with the viewing key
    // 2. Query recent notes for the campaign shielded address
    // 3. Decrypt and return only unprocessed transactions
    //
    // Example shape of a real response:
    // return [
    //   {
    //     txId: "txid...",
    //     amountZEC: 0.5,
    //     blockHeight: 2_100_000,
    //     receivedAt: new Date().toISOString(),
    //   },
    // ];
    // ------------------------------------------------------------------

    storage.addAgentLog(
      "warn",
      "Real Zcash viewing-key polling not yet configured — running in mock mode"
    );
    return [];
  }

  /**
   * Inject a simulated shielded donation (demo only).
   * This is the recommended way to demonstrate the full pipeline
   * during the 2-minute pitch without requiring a live Zcash node.
   */
  async simulateIncomingDonation(
    amountZEC: number,
    options?: { txId?: string; memo?: string }
  ): Promise<IncomingShieldedTx> {
    const tx: IncomingShieldedTx = {
      txId:
        options?.txId ||
        `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amountZEC,
      receivedAt: new Date().toISOString(),
      memo: options?.memo || "ShieldGive donation",
    };

    storage.addAgentLog("info", "Simulated shielded donation injected", {
      txId: tx.txId,
      amountZEC: tx.amountZEC,
    });

    return tx;
  }
}

export const zcashWatcher = new ZcashWatcher();
