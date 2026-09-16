import { useEffect, useState } from "react";
import { api, type Campaign } from "../lib/api";

export default function CampaignPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [wallet, setWallet] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getCampaign()
      .then(setCampaign)
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setMessage(null);
    try {
      await api.register(wallet.trim(), note.trim() || undefined);
      setMessage({
        type: "success",
        text: "Wallet registered. You can now send a shielded donation — the agent will mint your NFT automatically.",
      });
      setWallet("");
      setNote("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Registration failed",
      });
    } finally {
      setRegistering(false);
    }
  }

  function copyAddress() {
    if (!campaign) return;
    navigator.clipboard.writeText(campaign.shieldedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-slate-400">
        Loading campaign…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-red-400">
        Failed to load campaign.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-8">
      {/* Hero */}
      <section className="card p-8 sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-shield-400 mb-2">
              Live Campaign
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {campaign.title}
            </h1>
            <p className="mt-3 text-slate-300 leading-relaxed">
              {campaign.description}
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
            <p className="text-xs text-slate-400">Total Raised</p>
            <p className="mt-1 text-2xl font-semibold text-shield-300 font-mono">
              {campaign.totalRaisedZEC.toFixed(4)}{" "}
              <span className="text-sm text-slate-400">ZEC</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
            <p className="text-xs text-slate-400">Donations</p>
            <p className="mt-1 text-2xl font-semibold text-white font-mono">
              {campaign.donationCount}
            </p>
          </div>
        </div>
      </section>

      {/* Donation instructions */}
      <section className="card p-6 sm:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          1. Send a shielded donation
        </h2>
        <p className="text-sm text-slate-400">
          Use any Zcash wallet that supports shielded transactions (Orchard /
          Sapling). Your identity and exact amount stay private on-chain.
        </p>

        <div className="rounded-xl bg-slate-950 border border-slate-700 p-4">
          <p className="text-xs text-slate-500 mb-1">Campaign shielded address</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-sm font-mono text-zcash-gold">
              {campaign.shieldedAddress}
            </code>
            <button
              onClick={copyAddress}
              className="btn-secondary shrink-0 text-xs py-1.5 px-3"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </section>

      {/* Wallet registration */}
      <section className="card p-6 sm:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          2. Register your Solana wallet
        </h2>
        <p className="text-sm text-slate-400">
          Register once. When the agent detects your shielded payment it will
          automatically mint a donation-proof NFT to this address — no claim
          button needed.
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Solana wallet address
            </label>
            <input
              className="input font-mono"
              placeholder="Your Solana address (e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU)"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Optional note
            </label>
            <input
              className="input"
              placeholder="e.g. supporter from Jakarta"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {message && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                message.type === "success"
                  ? "bg-shield-500/10 text-shield-300 border border-shield-500/30"
                  : "bg-red-500/10 text-red-300 border border-red-500/30"
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={registering || !wallet.trim()}
            className="btn-primary w-full sm:w-auto"
          >
            {registering ? "Registering…" : "Register wallet"}
          </button>
        </form>
      </section>

      {/* How it works */}
      <section className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-white mb-4">How it works</h2>
        <ol className="space-y-3 text-sm text-slate-300">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-shield-500/20 text-xs font-bold text-shield-300">
              1
            </span>
            Register your Solana wallet above.
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-shield-500/20 text-xs font-bold text-shield-300">
              2
            </span>
            Send ZEC to the shielded address using any Zcash wallet.
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-shield-500/20 text-xs font-bold text-shield-300">
              3
            </span>
            The background agent detects the payment via viewing key (no manual
            report needed).
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-shield-500/20 text-xs font-bold text-shield-300">
              4
            </span>
            An NFT proof is minted automatically to your Solana wallet.
          </li>
        </ol>
      </section>
    </div>
  );
}
