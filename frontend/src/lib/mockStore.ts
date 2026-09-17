/**
 * Client-side mock store so the full demo works on static hosting (Vercel)
 * without requiring a live backend. State is persisted to localStorage
 * so it survives page refreshes — important for judges evaluating the demo.
 */

import type {
  Campaign,
  DonorRegistration,
  DetectedDonation,
  AgentLogEntry,
  AgentStatus,
} from "./api";

const STORAGE_KEY = "shieldgive_demo_v1";

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface PersistedState {
  campaign: Campaign;
  donors: DonorRegistration[];
  donations: DetectedDonation[];
  logs: AgentLogEntry[];
}

function defaultCampaign(): Campaign {
  return {
    id: "camp_demo_001",
    title: "Support Privacy Research",
    description:
      "Help fund independent research into zero-knowledge proofs and private public goods. All donations are shielded — your identity stays private while you still receive a collectible NFT proof on Solana.",
    shieldedAddress:
      "zs1demoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    createdAt: new Date().toISOString(),
    totalRaisedZEC: 0,
    donationCount: 0,
  };
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed?.campaign && Array.isArray(parsed.donors)) {
        return parsed;
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return {
    campaign: defaultCampaign(),
    donors: [],
    donations: [],
    logs: [
      {
        id: uid(),
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Agent started — demo mode (client-side mock)",
        meta: { mode: "static" },
      },
    ],
  };
}

function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

let state: PersistedState =
  typeof localStorage !== "undefined"
    ? loadState()
    : {
        campaign: defaultCampaign(),
        donors: [],
        donations: [],
        logs: [],
      };

function addLog(
  level: AgentLogEntry["level"],
  message: string,
  meta?: Record<string, unknown>
): void {
  state.logs.unshift({
    id: uid(),
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
  });
  if (state.logs.length > 100) state.logs.length = 100;
  saveState(state);
}

export const mockStore = {
  getCampaign(): Campaign {
    state = loadState();
    return { ...state.campaign };
  },

  registerDonor(solanaWallet: string, note?: string): DonorRegistration {
    state = loadState();
    const normalized = solanaWallet.trim();
    const existing = state.donors.find((d) => d.solanaWallet === normalized);
    if (existing) return existing;

    const reg: DonorRegistration = {
      id: uid(),
      solanaWallet: normalized,
      registeredAt: new Date().toISOString(),
      note,
    };
    state.donors.push(reg);
    addLog("info", "Donor wallet registered", {
      solanaWallet: reg.solanaWallet,
    });
    saveState(state);
    return reg;
  },

  getDonors(): DonorRegistration[] {
    state = loadState();
    return [...state.donors];
  },

  getDonations(): DetectedDonation[] {
    state = loadState();
    return [...state.donations].sort(
      (a, b) =>
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    );
  },

  getAgentLogs(limit = 50): AgentLogEntry[] {
    state = loadState();
    return state.logs.slice(0, limit);
  },

  getAgentStatus(): AgentStatus {
    state = loadState();
    return {
      mockZcash: true,
      mockSolana: true,
      pollIntervalSeconds: 30,
      totalDonations: state.donations.length,
      registeredDonors: state.donors.length,
    };
  },

  async simulateDonation(
    amountZEC: number,
    _memo?: string
  ): Promise<{ txId: string; amountZEC: number; message: string }> {
    state = loadState();
    const txId = `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const latestDonor = [...state.donors].sort(
      (a, b) =>
        new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
    )[0];

    addLog("info", "Simulated shielded donation injected", {
      txId,
      amountZEC,
    });
    addLog("info", "New shielded transaction detected", { txId, amountZEC });

    await new Promise((r) => setTimeout(r, 600));

    state = loadState();
    const donation: DetectedDonation = {
      id: uid(),
      txId,
      amountZEC,
      detectedAt: new Date().toISOString(),
      status: "pending",
      solanaWallet: latestDonor?.solanaWallet,
    };
    state.donations.unshift(donation);

    if (!latestDonor) {
      donation.status = "failed";
      donation.error = "No registered Solana wallet found";
      addLog(
        "warn",
        "Payment detected but no Solana wallet registered yet — NFT not minted",
        { txId }
      );
      state.campaign.totalRaisedZEC =
        Math.round((state.campaign.totalRaisedZEC + amountZEC) * 1e8) / 1e8;
      state.campaign.donationCount += 1;
      saveState(state);
      return {
        txId,
        amountZEC,
        message: "Donation recorded but no wallet to mint to",
      };
    }

    donation.status = "validated";
    addLog("success", "Payment validated", {
      solanaWallet: latestDonor.solanaWallet,
    });
    saveState(state);

    await new Promise((r) => setTimeout(r, 700));

    state = loadState();
    const mintAddress = `mint_${donation.id.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
    const target = state.donations.find((d) => d.id === donation.id);
    if (target) {
      target.status = "minted";
      target.nftMintAddress = mintAddress;
    }

    state.campaign.totalRaisedZEC =
      Math.round((state.campaign.totalRaisedZEC + amountZEC) * 1e8) / 1e8;
    state.campaign.donationCount += 1;

    addLog("success", "NFT minted (demo mode)", {
      mintAddress,
      recipientWallet: latestDonor.solanaWallet,
    });
    addLog("success", "Donation proof NFT minted & campaign updated", {
      mintAddress,
      totalRaisedZEC: state.campaign.totalRaisedZEC,
    });
    saveState(state);

    return {
      txId,
      amountZEC,
      message: "Simulated donation processed through the agent pipeline",
    };
  },

  /** Clear demo data (useful for judges re-testing from a clean state) */
  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
  },
};
