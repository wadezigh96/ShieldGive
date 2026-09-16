import { useEffect, useState } from "react";
import { api, type Campaign, type DetectedDonation } from "../lib/api";

export default function GalleryPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [donations, setDonations] = useState<DetectedDonation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getCampaign(), api.getDonations()])
      .then(([c, d]) => {
        setCampaign(c);
        setDonations(d);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-slate-400">
        Loading gallery…
      </div>
    );
  }

  const minted = donations.filter((d) => d.status === "minted");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Donation Gallery</h1>
        <p className="mt-1 text-slate-400 text-sm">
          Public totals and NFT proofs — donor identities remain private.
        </p>
      </div>

      {/* Totals */}
      <section className="grid sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-slate-400">Total Raised</p>
          <p className="mt-1 text-2xl font-semibold text-shield-300 font-mono">
            {campaign?.totalRaisedZEC.toFixed(4) ?? "0.0000"} ZEC
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-400">Donations Detected</p>
          <p className="mt-1 text-2xl font-semibold text-white font-mono">
            {campaign?.donationCount ?? 0}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-400">NFTs Minted</p>
          <p className="mt-1 text-2xl font-semibold text-white font-mono">
            {minted.length}
          </p>
        </div>
      </section>

      {/* NFT list */}
      <section className="card overflow-hidden">
        <div className="border-b border-slate-800 px-6 py-4">
          <h2 className="font-semibold text-white">Minted Proofs</h2>
        </div>

        {minted.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            No NFTs minted yet. Register a wallet and simulate (or send) a
            donation to see the first proof appear.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {minted.map((d) => (
              <li
                key={d.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="badge bg-shield-500/15 text-shield-300">
                      Minted
                    </span>
                    <span className="text-sm font-mono text-slate-300">
                      {d.amountZEC} ZEC
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono truncate max-w-md">
                    NFT: {d.nftMintAddress}
                  </p>
                  {d.solanaWallet && (
                    <p className="text-xs text-slate-600 font-mono truncate max-w-md">
                      → {d.solanaWallet.slice(0, 6)}…{d.solanaWallet.slice(-4)}
                    </p>
                  )}
                </div>
                <time className="text-xs text-slate-500 shrink-0">
                  {new Date(d.detectedAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-slate-600">
        Wallet addresses are partially redacted in the public gallery. Full
        privacy of the original Zcash transaction is preserved on-chain.
      </p>
    </div>
  );
}
