export interface Campaign {
  id: string;
  title: string;
  description: string;
  shieldedAddress: string;
  createdAt: string;
  totalRaisedZEC: number;
  donationCount: number;
}

export interface DonorRegistration {
  id: string;
  solanaWallet: string;
  registeredAt: string;
  note?: string;
  paymentMemo: string;
}

export type CrossL1ProofStatus =
  | "source_verified"
  | "solana_proof_minted"
  | "failed"
  | "mint_outcome_unknown";

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

export type DonationStatus =
  | "pending"
  | "validated"
  | "minting"
  | "minted"
  | "failed"
  | "mint_unknown";

export interface DetectedDonation {
  id: string;
  txId: string;
  amountZEC: number;
  detectedAt: string;
  status: DonationStatus;
  solanaWallet?: string;
  nftMintAddress?: string;
  /** Kept private for reconciliation; never returned by public APIs. */
  nftMintSignature?: string;
  crossL1Receipt?: CrossL1DonationReceipt;
  error?: string;
}

export interface AgentLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}

export interface MintResult {
  success: boolean;
  mintAddress?: string;
  signature?: string;
  error?: string;
  /** True when RPC submission was attempted and the final result may be ambiguous. */
  outcomeUnknown?: boolean;
}
