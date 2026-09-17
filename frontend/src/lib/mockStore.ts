/**
 * Client-side mock store so the full demo works on static hosting (Vercel)
 * without requiring a live backend. Mirrors the backend agent pipeline.
 */

import type {
  Campaign,
  DonorRegistration,
  DetectedDonation,
  AgentLogEntry,
  AgentStatus,
} from "./api";

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const campaign: Campaign = {
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

const donors: DonorRegistration[] = [];
const donations: DetectedDonation[] = [];
const logs: AgentLogEntry[] = [];

function addLog(
  level: AgentLogEntry["level"],
  message: string,
  meta?: Record<string, unknown>
): void {
  logs.unshift({
    id: uid(),
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
  });
  if (logs.length > 100) logs.length = 100;
}

// Seed initial agent log
addLog("info", "Agent started — demo mode (client-side mock)", {
  mode: "static",
});

export const mockStore = {
  getCampaign(): Campaign {
    return { ...campaign };
  },

  registerDonor(solanaWallet: string, note?: string): DonorRegistration {
    const existing = donors.find((d) => d.solanaWallet === solanaWallet.trim());
    if (existing) return existing;

    const reg: DonorRegistration = {
      id: uid(),
      solanaWallet: solanaWallet.trim(),
      registeredAt: new Date().toISOString(),
      note,
    };
    donors.push(reg);
    addLog("info", "Donor wallet registered", {
      solanaWallet: reg.solanaWallet,
    });
    return reg;
  },

  getDonors(): DonorRegistration[] {
    return [...donors];
  },

  getDonations(): DetectedDonation[] {
    return [...donations].sort(
      (a, b) =>
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    );
  },

  getAgentLogs(limit = 50): AgentLogEntry[] {
    return logs.slice(0, limit);
  },

  getAgentStatus(): AgentStatus {
    return {
      mockZcash: true,
      mockSolana: true,
      pollIntervalSeconds: 30,
      totalDonations: donations.length,
      registeredDonors: donors.length,
    };
  },

  async simulateDonation(
    amountZEC: number,
    _memo?: string
  ): Promise<{ txId: string; amountZEC: number; message: string }> {
    const txId = `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const latestDonor = [...donors].sort(
      (a, b) =>
        new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
    )[0];

    addLog("info", "Simulated shielded donation injected", {
      txId,
      amountZEC,
    });
    addLog("info", "New shielded transaction detected", { txId, amountZEC });

    await new Promise((r) => setTimeout(r, 600));

    const donation: DetectedDonation = {
      id: uid(),
      txId,
      amountZEC,
      detectedAt: new Date().toISOString(),
      status: "pending",
      solanaWallet: latestDonor?.solanaWallet,
    };
    donations.unshift(donation);

    if (!latestDonor) {
      donation.status = "failed";
      donation.error = "No registered Solana wallet found";
      addLog(
        "warn",
        "Payment detected but no Solana wallet registered yet — NFT not minted",
        { txId }
      );
      campaign.totalRaisedZEC =
        Math.round((campaign.totalRaisedZEC + amountZEC) * 1e8) / 1e8;
      campaign.donationCount += 1;
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

    await new Promise((r) => setTimeout(r, 700));

    const mintAddress = `mint_${donation.id.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
    donation.status = "minted";
    donation.nftMintAddress = mintAddress;

    campaign.totalRaisedZEC =
      Math.round((campaign.totalRaisedZEC + amountZEC) * 1e8) / 1e8;
    campaign.donationCount += 1;

    addLog("success", "NFT minted (demo mode)", {
      mintAddress,
      recipientWallet: latestDonor.solanaWallet,
    });
    addLog("success", "Donation proof NFT minted & campaign updated", {
      mintAddress,
      totalRaisedZEC: campaign.totalRaisedZEC,
    });

    return {
      txId,
      amountZEC,
      message: "Simulated donation processed through the agent pipeline",
    };
  },
};
