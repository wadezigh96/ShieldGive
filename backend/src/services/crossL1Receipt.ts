import { createHash } from "node:crypto";
import type {
  CrossL1DonationReceipt,
  CrossL1ProofStatus,
} from "../types/index.js";

export type { CrossL1DonationReceipt, CrossL1ProofStatus };

/**
 * Creates a deterministic receipt for the L1+L1 experiment.
 *
 * This is proof metadata only, not a bridge: no funds are moved across chains.
 */
export function createCrossL1Receipt(params: {
  sourceTxId: string;
  donationId: string;
  amountZEC: number;
  solanaWallet: string;
  createdAt?: string;
}): CrossL1DonationReceipt {
  const createdAt = params.createdAt || new Date().toISOString();
  const receiptId = createHash("sha256")
    .update(
      [
        "shieldgive:l1l1:v1",
        params.sourceTxId,
        params.donationId,
        params.amountZEC.toFixed(8),
        params.solanaWallet,
      ].join(":"),
    )
    .digest("hex");

  return {
    receiptId,
    sourceChain: "zcash",
    destinationChain: "solana",
    sourceTxId: params.sourceTxId,
    donationId: params.donationId,
    amountZEC: params.amountZEC,
    solanaWallet: params.solanaWallet,
    status: "source_verified" satisfies CrossL1ProofStatus,
    createdAt,
  };
}
