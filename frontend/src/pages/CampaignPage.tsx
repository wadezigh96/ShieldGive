import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import { api, type Campaign, type DetectedDonation, type WalletSession } from "../lib/api";

export default function CampaignPage() {
  const { authenticated, login, logout, user } = usePrivy();
  const { wallets: signingWallets } = useWallets();
  const { signMessage } = useSignMessage();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [wallet, setWallet] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentMemo, setPaymentMemo] = useState("");
  const [latestDonation, setLatestDonation] = useState<DetectedDonation | null>(null);
  const [memoCopied, setMemoCopied] = useState(false);
  const [statusSession, setStatusSession] = useState<WalletSession | null>(null);
  const [verifyingWallet, setVerifyingWallet] = useState(false);

  const privySolanaWallet = useMemo(() => {
    const accounts = user?.linkedAccounts ?? [];
    const account = accounts.find((item) =>
      item.type === "wallet" && "chainType" in item && item.chainType === "solana"
    );
    return account && "address" in account ? account.address : "";
  }, [user]);

  useEffect(() => { setWallet(privySolanaWallet); }, [privySolanaWallet]);

  useEffect(() => {
    api.getCampaign().then(setCampaign)
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!statusSession || statusSession.solanaWallet !== wallet.trim() ||
        new Date(statusSession.expiresAt).getTime() <= Date.now()) {
      setLatestDonation(null);
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        const donations = await api.getMyDonations(statusSession.token);
        if (!active) return;
        const mine = donations[0] ?? null;
        setLatestDonation(mine);
        if (mine?.status === "minted") {
          const updatedCampaign = await api.getCampaign();
          if (active) setCampaign(updatedCampaign);
        }
      } catch (err) {
        // A session expires after 15 minutes; require a fresh signed challenge.
        if (active && err instanceof Error && err.message.includes("HTTP 401")) {
          setStatusSession(null);
          setLatestDonation(null);
        }
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [wallet, statusSession]);

  useEffect(() => {
    if (statusSession && statusSession.solanaWallet !== wallet.trim()) {
      setStatusSession(null);
      setLatestDonation(null);
    }
  }, [wallet, statusSession]);

  async function establishWalletSession(walletAddress: string): Promise<string> {
    const existing = statusSession;
    if (
      existing &&
      existing.solanaWallet === walletAddress &&
      new Date(existing.expiresAt).getTime() > Date.now()
    ) {
      return existing.token;
    }

    const signingWallet = signingWallets.find((candidate) => candidate.address === walletAddress);
    if (!signingWallet) {
      throw new Error("Reconnect this Solana wallet in Privy before signing the ownership challenge.");
    }

    const challenge = await api.createWalletChallenge(walletAddress);
    const signed = await signMessage({
      message: new TextEncoder().encode(challenge.message),
      wallet: signingWallet,
      options: { uiOptions: { title: "Verify ShieldGive wallet ownership" } },
    });
    const signatureBase64 = btoa(
      Array.from(signed.signature, (byte) => String.fromCharCode(byte)).join(""),
    );
    const session = await api.createWalletSession({
      solanaWallet: walletAddress,
      challengeId: challenge.challengeId,
      message: challenge.message,
      signature: signatureBase64,
    });
    setStatusSession(session);
    return session.token;
  }

  async function handleVerifyWallet() {
    if (!authenticated) { login(); return; }
    if (!wallet.trim()) {
      setMessage({ type: "error", text: "Connect a Privy Solana wallet first." });
      return;
    }
    setVerifyingWallet(true);
    setMessage(null);
    try {
      await establishWalletSession(wallet.trim());
      setMessage({
        type: "success",
        text: "Wallet ownership verified. Private donation status is unlocked for 15 minutes. Signing a message does not send a transaction or charge a network fee.",
      });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Wallet verification failed" });
    } finally {
      setVerifyingWallet(false);
    }
  }

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
      const walletAddress = wallet.trim();
      const sessionToken = await establishWalletSession(walletAddress);
      const registration = await api.register(
        walletAddress,
        note.trim() || undefined,
        sessionToken,
      );
      setPaymentMemo(registration.paymentMemo);
      setMessage({ type: "success", text: "Wallet ownership verified and registered. Use the payment memo below when sending ZEC so the private donation can be matched to this Solana proof wallet." });
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

  function copyMemo() {
    if (!paymentMemo) return;
    navigator.clipboard.writeText(paymentMemo);
    setMemoCopied(true);
    setTimeout(() => setMemoCopied(false), 2000);
  }

  function donationStatus() {
    if (!latestDonation) {
      return {
        title: "Waiting for Zcash donation",
        detail: "After you send ZEC with your donor memo, ShieldGive will poll for the donation.",
        tone: "text-slate-300",
      };
    }
    if (latestDonation.status === "pending") {
      return {
        title: "Zcash detected",
        detail: "The agent has detected the donation and is validating it.",
        tone: "text-zcash-gold",
      };
    }
    if (latestDonation.status === "validated" && latestDonation.crossL1Receipt?.status === "source_verified") {
      return {
        title: "Cross-L1 verified",
        detail: "The Zcash source payment is verified. The Solana proof mint is next.",
        tone: "text-shield-300",
      };
    }
    if (latestDonation.status === "minted" && latestDonation.crossL1Receipt?.status === "solana_proof_minted") {
      return {
        title: "Solana proof minted",
        detail: latestDonation.nftMintAddress
          ? `Your proof NFT is recorded on Solana: ${latestDonation.nftMintAddress}`
          : "Your contribution proof has been minted on Solana.",
        tone: "text-shield-300",
      };
    }
    if (latestDonation.status === "mint_unknown") {
      return {
        title: "Mint requires on-chain review",
        detail: "The Solana RPC result was ambiguous. ShieldGive has blocked automatic retries to prevent duplicate proof NFTs; the transaction must be reconciled on-chain.",
        tone: "text-amber-300",
      };
    }
    if (latestDonation.status === "failed") {
      return {
        title: "Processing needs attention",
        detail: latestDonation.error || "The donation could not be completed yet. The agent can retry after the issue is resolved.",
        tone: "text-red-300",
      };
    }
    return {
      title: "Processing donation",
      detail: "ShieldGive is moving the donation through validation and proof creation.",
      tone: "text-slate-300",
    };
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
          {paymentMemo && (
            <div className="rounded-xl bg-slate-950 border border-shield-500/30 p-4">
              <p className="text-xs text-slate-500 mb-1">Zcash payment memo</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-sm font-mono text-zcash-gold">{paymentMemo}</code>
                <button type="button" onClick={copyMemo} className="btn-secondary shrink-0 text-xs py-1.5 px-3">
                  {memoCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Include this exact memo in your shielded Zcash donation. It is a correlation identifier, not a secret.
              </p>
            </div>
          )}

          <div className="rounded-xl bg-slate-950 border border-slate-700 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Live donation status</p>
                <p className={`mt-1 font-semibold ${donationStatus().tone}`}>{donationStatus().title}</p>
              </div>
              <span className="text-xs text-slate-500">updates every 4s</span>
            </div>
            {!statusSession && (
              <div className="mt-3">
                <p className="mb-3 text-sm text-slate-400">
                  Verify that you control this Solana wallet to read its private donation status. This asks for a message signature only; it does not send a transaction.
                </p>
                <button
                  type="button"
                  onClick={handleVerifyWallet}
                  disabled={verifyingWallet || !wallet}
                  className="btn-secondary"
                >
                  {verifyingWallet ? "Verifying wallet…" : "Verify wallet for private status"}
                </button>
              </div>
            )}
            <p className="mt-2 text-sm text-slate-400">{donationStatus().detail}</p>
            {latestDonation && statusSession && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Amount</span>
                  <p className="mt-1 font-mono text-slate-200">{latestDonation.amountZEC?.toFixed(4) ?? "—"} ZEC</p>
                </div>
                <div>
                  <span className="text-slate-500">Zcash tx</span>
                  <p className="mt-1 truncate font-mono text-slate-200">{latestDonation.txId}</p>
                </div>
              </div>
            )}
          </div>
        </form>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-white mb-4">How ShieldGive works</h2>
        <ol className="space-y-3 text-sm text-slate-300">
          <li>1. Connect or create a Solana wallet with Privy.</li>
          <li>2. Copy your private donor memo and include it with the shielded Zcash contribution.</li>
          <li>3. Send the contribution to the campaign shielded address.</li>
          <li>4. ShieldGive detects the Zcash payment and correlates it to your registered Solana proof wallet.</li>
          <li>5. A cross-L1 receipt is created, then the existing Solana proof minting flow can issue the contribution proof.</li>
          <li>6. No funds are bridged to Solana in this experiment; the Solana asset is the public contribution proof.</li>
        </ol>
      </section>
    </div>
  );
}
