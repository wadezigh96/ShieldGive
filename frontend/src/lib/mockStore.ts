/** Client-side deterministic demo store for static hosting. */
import type { Campaign, DonorRegistration, DetectedDonation, AgentLogEntry, AgentStatus } from "./api";

const STORAGE_KEY = "shieldgive_demo_v2";
function uid(): string { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

interface PersistedState { campaign: Campaign; donors: DonorRegistration[]; donations: DetectedDonation[]; logs: AgentLogEntry[]; }

function defaultCampaign(): Campaign {
  return {
    id: "camp_demo_001",
    title: "ShieldGive — Private Contribution Proofs",
    description: "Make a private Zcash contribution and associate it with a verifiable Solana proof wallet. ShieldGive separates donor identity from the public proof layer and keeps the contribution workflow privacy-focused.",
    shieldedAddress: "zs1demoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    createdAt: new Date().toISOString(), totalRaisedZEC: 0, donationCount: 0,
  };
}
function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const parsed = JSON.parse(raw) as PersistedState; if (parsed?.campaign && Array.isArray(parsed.donors)) return parsed; }
  } catch {}
  return { campaign: defaultCampaign(), donors: [], donations: [], logs: [{ id: uid(), timestamp: new Date().toISOString(), level: "info", message: "Agent started — demo mode (client-side mock)", meta: { mode: "static" } }] };
}
function saveState(state: PersistedState): void { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
let state: PersistedState = typeof localStorage !== "undefined" ? loadState() : { campaign: defaultCampaign(), donors: [], donations: [], logs: [] };
function addLog(level: AgentLogEntry["level"], message: string, meta?: Record<string, unknown>): void {
  state.logs.unshift({ id: uid(), timestamp: new Date().toISOString(), level, message, meta });
  if (state.logs.length > 100) state.logs.length = 100; saveState(state);
}
export const mockStore = {
  getCampaign(): Campaign { state = loadState(); return { ...state.campaign }; },
  registerDonor(solanaWallet: string, note?: string): DonorRegistration {
    state = loadState(); const normalized = solanaWallet.trim();
    const existing = state.donors.find((d) => d.solanaWallet === normalized); if (existing) return existing;
    const reg={ id:uid(), solanaWallet:normalized, registeredAt:new Date().toISOString(), note };
    state.donors.push(reg); addLog("info","Donor wallet registered",{ solanaWallet:reg.solanaWallet, donorId:reg.id }); saveState(state); return reg;
  },
  getDonors(): DonorRegistration[] { state=loadState(); return [...state.donors]; },
  getDonations(): DetectedDonation[] { state=loadState(); return [...state.donations].sort((a,b)=>new Date(b.detectedAt).getTime()-new Date(a.detectedAt).getTime()); },
  getAgentLogs(limit=50): AgentLogEntry[] { state=loadState(); return state.logs.slice(0,limit); },
  getAgentStatus(): AgentStatus { state=loadState(); return { mockZcash:true,mockSolana:true,pollIntervalSeconds:30,totalDonations:state.donations.length,registeredDonors:state.donors.length,backendConnected:false,mode:"DEMO_LOCAL" }; },
  async simulateDonation(amountZEC:number, memo?:string):Promise<{txId:string;amountZEC:number;message:string}> {
    state=loadState();
    const txId=`mock_tx_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const donorId=memo?.match(/donor=([a-zA-Z0-9_-]+)/i)?.[1];
    const donor=state.donors.find(d=>d.id===donorId);
    addLog("info","Simulated shielded donation injected",{txId,amountZEC,donorId});
    if(!donor){ addLog("warn","Payment detected but donor correlation failed — NFT not minted",{txId,donorId}); saveState(state); return {txId,amountZEC,message:"Donation rejected: donor correlation failed"}; }
    await new Promise(r=>setTimeout(r,600)); state=loadState();
    const donation:DetectedDonation={id:uid(),txId,amountZEC,detectedAt:new Date().toISOString(),status:"pending",solanaWallet:donor.solanaWallet};
    state.donations.unshift(donation); donation.status="validated";
    addLog("success","Payment validated",{solanaWallet:donor.solanaWallet,donorId});
    saveState(state); await new Promise(r=>setTimeout(r,700)); state=loadState();
    const mintAddress=`mint_${donation.id.replace(/[^a-z0-9]/gi,"").slice(0,16)}`;
    const target=state.donations.find(d=>d.id===donation.id);
    if(target){target.status="minted";target.nftMintAddress=mintAddress;}
    state.campaign.totalRaisedZEC=Math.round((state.campaign.totalRaisedZEC+amountZEC)*1e8)/1e8;
    state.campaign.donationCount+=1;
    addLog("success","NFT minted (demo mode)",{mintAddress,recipientWallet:donor.solanaWallet});
    addLog("success","Donation proof NFT minted & campaign updated",{mintAddress,totalRaisedZEC:state.campaign.totalRaisedZEC});
    saveState(state); return {txId,amountZEC,message:"Simulated donation processed through the agent pipeline"};
  },
  reset():void { localStorage.removeItem(STORAGE_KEY); state=loadState(); },
};
