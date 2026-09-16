const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || json.error || "Request failed");
  }
  return json.data as T;
}

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
  txId: string;
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

export interface AgentStatus {
  mockZcash: boolean;
  mockSolana: boolean;
  pollIntervalSeconds: number;
  totalDonations: number;
  registeredDonors: number;
}

export const api = {
  getCampaign: () => request<Campaign>("/campaign"),
  register: (solanaWallet: string, note?: string) =>
    request<DonorRegistration>("/register", {
      method: "POST",
      body: JSON.stringify({ solanaWallet, note }),
    }),
  getDonors: () => request<DonorRegistration[]>("/donors"),
  getDonations: () => request<DetectedDonation[]>("/donations"),
  getAgentLogs: (limit = 40) =>
    request<AgentLogEntry[]>(`/agent/logs?limit=${limit}`),
  getAgentStatus: () => request<AgentStatus>("/agent/status"),
  simulateDonation: (amountZEC: number, memo?: string) =>
    request<{ txId: string; amountZEC: number; message: string }>(
      "/agent/simulate",
      {
        method: "POST",
        body: JSON.stringify({ amountZEC, memo }),
      }
    ),
};
