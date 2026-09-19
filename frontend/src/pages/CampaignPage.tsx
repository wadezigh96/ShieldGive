import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { api, type Campaign } from "../lib/api";

export default function CampaignPage() {
  const { authenticated, login, logout, user } = usePrivy();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [wallet, setWallet] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const privySolanaWallet = useMemo(() => {
    const accounts = user?.linkedAccounts ?? [];
    const account = accounts.find((item) =>
      item.type === "wallet" && "chainType" in item && item.chainType === "solana"
    );
    return account && "address" in account ? account.address : "";
  }, [user]);

  useEffect(() => { if (privySolanaWallet) setWallet(privySolanaWallet); }, [privySolanaWallet]);

  useEffect(() => {
    api.getCampaign().then(setCampaign)
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!authenticated) { login(); return; }
    if (!wallet.trim()) {
      setMessage({ type: "error", text: "Connect a Privy Solana wallet first." });
      return;
    }
    setRegistering(true);
    setMessage(null);
    try {
      await api.register(wallet.trim(), note.trim() || undefined);
      setMessage({ type: "success", text: "Wallet registered. Your contribution can now be associated with a Solana proof when live minting is enabled." });
      setNote("");
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Registration failed" });
    } finally { setRegistering(false); }
  }

  function copyAddress() {
    if (!campaign) return;
    navigator.clipboard.writeText(campaign.shieldedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-slate-400">Loading campaign…</div>;
  if (!campaign) return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-red-400">Failed to load campaign.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-8">
      <section className="card p-8 sm:p-10">
        <p className="text-xs font-medium uppercase tracking-wider text-shield-400 mb-2">Active Campaign</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{campaign.title}</h1>
        <p className="mt-3 text-slate-300 leading-relaxed">{campaign.description}</p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
            <p className="text-xs text-slate-400">Total Raised</p>
            <p className="mt-1 text-2xl font-semibold text-shield-300 font-mono">{campaign.totalRaisedZEC.toFixed(4)} <span className="text-sm text-slate-400">ZEC</span></p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
            <p className="text-xs text-slate-400">Donations</p>
            <p className="mt-1 text-2xl font-semibold text-white font-mono">{campaign.donationCount}</p>
          </div>
        </div>
      </section>

      <section className="card p-6 sm:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white">1. Make a private contribution</h2>
        <p className="text-sm text-slate-400">Send a shielded Zcash contribution using a wallet that supports Orchard or Sapling. ShieldGive is designed to minimize exposure of donor identity and transaction details.</p>
        <div className="rounded-xl bg-slate-950 border border-slate-700 p-4">
          <p className="text-xs text-slate-500 mb-1">Campaign private address</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-sm font-mono text-zcash-gold">{campaign.shieldedAddress}</code>
            <button onClick={copyAddress} className="btn-secondary shrink-0 text-xs py-1.5 px-3">{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      </section>

      <section className="card p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">2. Connect your Solana wallet</h2>
            <p className="mt-1 text-sm text-slate-400">Privy is configured for Solana-only wallet login. Use a Solana wallet here for your contribution proof.</p>
          </div>
          {authenticated ? <button type="button" onClick={logout} className="btn-secondary shrink-0">Disconnect</button> : <button type="button" onClick={login} className="btn-primary shrink-0">Connect Solana Wallet</button>}
        </div>
        <div className="rounded-xl bg-slate-950 border border-slate-700 p-4">
          <p className="text-xs text-slate-500 mb-1">Solana proof wallet</p>
          <code className="break-all text-sm font-mono text-shield-300">{wallet || "Not connected"}</code>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <input className="input" placeholder="Optional supporter note" value={note} onChange={(e) => setNote(e.target.value)} />
          {message && (
            <div className={"rounded-xl px-4 py-3 text-sm " + (message.type === "success" ? "bg-shield-500/10 text-shield-300 border border-shield-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30")}>
              {message.text}
            </div>
          )}
          <button type="submit" disabled={registering || !wallet} className="btn-primary w-full sm:w-auto">
            {registering ? "Registering…" : "Register wallet for proof"}
          </button>
        </form>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-white mb-4">How ShieldGive works</h2>
        <ol className="space-y-3 text-sm text-slate-300">
          <li>1. Connect or create a Solana wallet with Privy.</li>
          <li>2. Send a shielded Zcash contribution to the campaign address.</li>
          <li>3. ShieldGive detects and validates the contribution through its processing workflow.</li>
          <li>4. A contribution proof can be minted to your registered Solana wallet when live Solana minting is enabled.</li>
        </ol>
      </section>
    </div>
  );
}
