/**
 * API client with automatic fallback to client-side mock store.
 * This allows the full demo to work on static Vercel hosting without a backend.
 */

import { mockStore } from "./mockStore";

const BASE = "/api";

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || json.error || "Request failed");
    return json.data as T;
  } catch {
    // Backend unavailable → fall back to client-side mock (demo mode)
    return mockFallback<T>(path, options);
  }
}

async function mockFallback<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {};
  if (options?.body && typeof options.body === "string") {
    try {
      body = JSON.parse(options.body);
    } catch {
      /* ignore */
    }
  }

  if (path === "/campaign" && method === "GET") {
    return mockStore.getCampaign() as T;
  }
  if (path === "/register" && method === "POST") {
    return mockStore.registerDonor(
      String(body.solanaWallet || ""),
      body.note ? String(body.note) : undefined
    ) as T;
  }
  if (path === "/donors" && method === "GET") {
    return mockStore.getDonors() as T;
  }
  if (path === "/donations" && method === "GET") {
    return mockStore.getDonations() as T;
  }
  if (path.startsWith("/agent/logs") && method === "GET") {
    const limit = parseInt(path.split("limit=")[1] || "40", 10);
    return mockStore.getAgentLogs(limit) as T;
  }
  if (path === "/agent/status" && method === "GET") {
    return mockStore.getAgentStatus() as T;
  }
  if (path === "/agent/simulate" && method === "POST") {
    return (await mockStore.simulateDonation(
      Number(body.amountZEC) || 0.25,
      body.memo ? String(body.memo) : undefined
    )) as T;
  }

  throw new Error(`Mock: unsupported path ${method} ${path}`);
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
