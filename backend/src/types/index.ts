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
}

export interface DetectedDonation {
  id: string;
  txId: string; // Zcash txid (or mock id)
  amountZEC: number;
  detectedAt: string;
  status: "pending" | "validated" | "minted" | "failed";
  solanaWallet?: string;
  nftMintAddress?: string;
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
