import { useCallback, useEffect, useState } from "react";
import {
  api,
  type AgentLogEntry,
  type AgentStatus,
} from "../lib/api";

export default function AgentDashboard() {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [amount, setAmount] = useState("0.25");
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        api.getAgentLogs(50),
        api.getAgentStatus(),
      ]);
      setLogs(l);
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent data");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleSimulate() {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      setError("Enter a valid positive amount");
      return;
    }
    setSimulating(true);
    setError(null);
    try {
      await api.simulateDonation(value, "Demo donation from Agent Dashboard");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  }

  const levelColor: Record<AgentLogEntry["level"], string> = {
    info: "text-slate-400",
    success: "text-shield-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Agent Dashboard</h1>
        <p className="mt-1 text-slate-400 text-sm">
          Live view of the automated monitoring & minting pipeline. This is a
          deterministic scheduled job — not an LLM agent.
        </p>
      </div>

      {/* Status cards */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-slate-400">Zcash Mode</p>
          <p className="mt-1 font-medium text-white">
            {status?.mockZcash ? "Mock (demo)" : "Live viewing key"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">Solana Mode</p>
          <p className="mt-1 font-medium text-white">
            {status?.mockSolana ? "Mock mint" : "Live Metaplex"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">Poll Interval</p>
          <p className="mt-1 font-medium text-white font-mono">
            {status?.pollIntervalSeconds ?? "—"}s
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">Registered Donors</p>
          <p className="mt-1 font-medium text-white font-mono">
            {status?.registeredDonors ?? 0}
          </p>
        </div>
      </section>

      {/* Simulate control — critical for the 2-min demo */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-white mb-1">
          Simulate Shielded Donation
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Inject a realistic payment into the same pipeline the cron job uses.
          Perfect for the live demo when a real Zcash node is not available.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="w-full sm:w-40">
            <label className="block text-xs text-slate-400 mb-1.5">
              Amount (ZEC)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="input font-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="btn-primary"
          >
            {simulating ? "Processing…" : "Run agent pipeline"}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}
      </section>

      {/* Live logs */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="font-semibold text-white">Agent Activity Log</h2>
          <button
            onClick={refresh}
            className="text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Refresh
          </button>
        </div>

        <div className="max-h-[480px] overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-500">
              Waiting for agent activity…
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/80">
              {logs.map((entry) => (
                <li
                  key={entry.id}
                  className="px-6 py-3 flex gap-4 hover:bg-slate-900/40"
                >
                  <time className="shrink-0 text-slate-600 w-20">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </time>
                  <span
                    className={`shrink-0 w-16 uppercase tracking-wide ${levelColor[entry.level]}`}
                  >
                    {entry.level}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-300">{entry.message}</p>
                    {entry.meta && (
                      <pre className="mt-1 text-slate-600 overflow-x-auto">
                        {JSON.stringify(entry.meta)}
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
