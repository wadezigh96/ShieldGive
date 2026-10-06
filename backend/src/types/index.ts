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

export interface CrossL1DonationReceipt {
  receiptId: string;
  sourceChain: "zcash";
  destinationChain: "solana";
  sourceTxId: string;
  donationId: string;
  amountZEC: number;
  solanaWallet: string;
  status: "source_verified" | "solana_proof_minted" | "failed";
  createdAt: string;
  solanaMintAddress?: string;
}

export interface DetectedDonation {
  id: string;
  txId: string;
  amountZEC: number;
  detectedAt: string;
  status: "pending" | "validated" | "minted" | "failed";
  solanaWallet?: string;
  nftMintAddress?: string;
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
}
