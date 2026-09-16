import { v4 as uuidv4 } from "uuid";
import type {
  Campaign,
  DonorRegistration,
  DetectedDonation,
  AgentLogEntry,
} from "../types/index.js";

/**
 * Simple in-memory store for the MVP demo.
 * Replace with a real database (Postgres / SQLite) for production.
 */
class Storage {
  private campaign: Campaign;
  private donors: Map<string, DonorRegistration> = new Map();
  private donations: Map<string, DetectedDonation> = new Map();
  private agentLogs: AgentLogEntry[] = [];
  private processedTxIds: Set<string> = new Set();

  constructor() {
    this.campaign = {
      id: "camp_demo_001",
      title: "Support Privacy Research",
      description:
        "Help fund independent research into zero-knowledge proofs and private public goods. All donations are shielded — your identity stays private while you still receive a collectible NFT proof on Solana.",
      shieldedAddress:
        process.env.CAMPAIGN_SHIELDED_ADDRESS ||
        "zs1demoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      createdAt: new Date().toISOString(),
      totalRaisedZEC: 0,
      donationCount: 0,
    };
  }

  getCampaign(): Campaign {
    return { ...this.campaign };
  }

  registerDonor(solanaWallet: string, note?: string): DonorRegistration {
    const normalized = solanaWallet.trim();
    if (!normalized) {
      throw new Error("Solana wallet address is required");
    }

    // Simple uniqueness by wallet
    for (const existing of this.donors.values()) {
      if (existing.solanaWallet === normalized) {
        return existing;
      }
    }

    const registration: DonorRegistration = {
      id: uuidv4(),
      solanaWallet: normalized,
      registeredAt: new Date().toISOString(),
      note,
    };
    this.donors.set(registration.id, registration);
    return registration;
  }

  getDonors(): DonorRegistration[] {
    return Array.from(this.donors.values());
  }

  findDonorByWallet(wallet: string): DonorRegistration | undefined {
    const normalized = wallet.trim();
    return Array.from(this.donors.values()).find(
      (d) => d.solanaWallet === normalized
    );
  }

  /** Returns the most recent registered donor (demo heuristic). */
  getLatestDonor(): DonorRegistration | undefined {
    const all = this.getDonors();
    if (all.length === 0) return undefined;
    return all.sort(
      (a, b) =>
        new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
    )[0];
  }

  isTxProcessed(txId: string): boolean {
    return this.processedTxIds.has(txId);
  }

  markTxProcessed(txId: string): void {
    this.processedTxIds.add(txId);
  }

  addDonation(donation: Omit<DetectedDonation, "id">): DetectedDonation {
    const full: DetectedDonation = {
      id: uuidv4(),
      ...donation,
    };
    this.donations.set(full.id, full);
    return full;
  }

  updateDonation(
    id: string,
    patch: Partial<DetectedDonation>
  ): DetectedDonation | null {
    const existing = this.donations.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.donations.set(id, updated);
    return updated;
  }

  getDonations(): DetectedDonation[] {
    return Array.from(this.donations.values()).sort(
      (a, b) =>
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    );
  }

  recordRaised(amountZEC: number): void {
    this.campaign.totalRaisedZEC =
      Math.round((this.campaign.totalRaisedZEC + amountZEC) * 1e8) / 1e8;
    this.campaign.donationCount += 1;
  }

  addAgentLog(
    level: AgentLogEntry["level"],
    message: string,
    meta?: Record<string, unknown>
  ): AgentLogEntry {
    const entry: AgentLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
    };
    this.agentLogs.unshift(entry);
    // Keep last 200 entries for demo
    if (this.agentLogs.length > 200) {
      this.agentLogs = this.agentLogs.slice(0, 200);
    }
    return entry;
  }

  getAgentLogs(limit = 50): AgentLogEntry[] {
    return this.agentLogs.slice(0, limit);
  }
}

export const storage = new Storage();
