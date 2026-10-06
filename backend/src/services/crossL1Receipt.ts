import { createHash } from "node:crypto";

export type CrossL1ProofStatus =
  | "source_verified"
  | "solana_proof_minted"
  | "failed";

export interface CrossL1DonationReceipt {
  receiptId: string;
  sourceChain: "zcash";
  destinationChain: "solana";
  sourceTxId: string;
  donationId: string;
  amountZEC: number;
  solanaWallet: string;
  status: CrossL1ProofStatus;
  createdAt: string;
  solanaMintAddress?: string;
}

/**
 * Creates a deterministic receipt for the L1+L1 experiment.
 *
 * This is intentionally NOT a bridge and never moves funds between chains.
 * It binds an observed Zcash donation to the existing Solana proof flow.
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
      ].join(":")
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
    status: "source_verified",
    createdAt,
  };
}
