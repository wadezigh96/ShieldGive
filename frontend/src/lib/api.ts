const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export interface Campaign {
  id: string; title: string; description: string; shieldedAddress: string;
  createdAt: string; totalRaisedZEC: number; donationCount: number;
}
export interface DonorRegistration {
  id: string; solanaWallet: string; registeredAt: string; note?: string; paymentMemo: string;
}
export interface CrossL1DonationReceipt {
  receiptId: string; sourceChain: "zcash"; destinationChain: "solana";
  sourceTxId?: string; donationId?: string; amountZEC?: number; solanaWallet?: string;
  status: "source_verified" | "solana_proof_minted" | "failed" | "mint_outcome_unknown";
  createdAt?: string; solanaMintAddress?: string;
}
export type DonationStatus = "pending" | "validated" | "minting" | "minted" | "failed" | "mint_unknown";
export interface DetectedDonation {
  id: string; txId?: string; amountZEC?: number; detectedAt?: string;
  status: DonationStatus;
  solanaWallet?: string; nftMintAddress?: string; nftMintSignature?: string; error?: string;
  crossL1Receipt?: CrossL1DonationReceipt;
}
export interface WalletChallenge {
  challengeId: string; solanaWallet: string; message: string; expiresAt: string;
}
export interface WalletSession {
  solanaWallet: string; token: string; expiresAt: string;
}
export interface AgentLogEntry {
  id: string; timestamp: string; level: "info" | "success" | "warn" | "error";
  message: string; meta?: Record<string, unknown>;
}
export interface AgentStatus {
  mockZcash: boolean; mockSolana: boolean; pollIntervalSeconds: number;
  totalDonations: number; registeredDonors: number; backendConnected: boolean;
  mode: "LIVE_BACKEND" | "DEMO_LOCAL";
  persistence?: "memory" | "postgres";
  reconciliationRequired?: number;
  totalRaisedZEC?: number;
  liveSolanaMintEnabled?: boolean;
}

let lastBackendConnected = false;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers }, ...options,
  });
  if (!res.ok) {
    lastBackendConnected = false;
    throw new Error(`Backend unavailable: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) {
    lastBackendConnected = false;
    throw new Error(json.error?.message || json.error || "Backend request failed");
  }
  lastBackendConnected = true;
  return json.data as T;
}

export const api = {
  getCampaign: () => request<Campaign>("/campaign"),
  createWalletChallenge: (solanaWallet: string) =>
    request<WalletChallenge>("/wallet/challenge", {
      method: "POST", body: JSON.stringify({ solanaWallet }),
    }),
  createWalletSession: (input: {
    solanaWallet: string; challengeId: string; message: string; signature: string;
  }) => request<WalletSession>("/wallet/session", {
    method: "POST", body: JSON.stringify(input),
  }),
  register: (solanaWallet: string, note: string | undefined, token: string) =>
    request<DonorRegistration>("/register", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ solanaWallet, note }),
    }),
  getDonors: () => request<DonorRegistration[]>("/donors"),
  // Public route returns only completed proof records in production.
  getDonations: () => request<DetectedDonation[]>("/donations"),
  getMyDonations: (token: string) => request<DetectedDonation[]>("/donations/mine", {
    headers: { Authorization: `Bearer ${token}` },
  }),
  getAgentLogs: (limit = 40) => request<AgentLogEntry[]>(`/agent/logs?limit=${limit}`),
  getAgentStatus: () => request<AgentStatus>("/agent/status").then((status) => ({
    ...status,
    backendConnected: lastBackendConnected,
    mode: "LIVE_BACKEND" as const,
  })),
  simulateDonation: (amountZEC: number, memo?: string) => request<{ txId: string; amountZEC: number; message: string }>(
    "/agent/simulate", { method: "POST", body: JSON.stringify({ amountZEC, memo }) }
  ),
};
