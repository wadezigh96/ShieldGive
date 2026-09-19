import { Routes, Route, NavLink } from "react-router-dom";
import CampaignPage from "./pages/CampaignPage";
import GalleryPage from "./pages/GalleryPage";
import AgentDashboard from "./pages/AgentDashboard";

function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? "bg-shield-500/20 text-shield-300" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"}`;

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-shield-400 to-shield-600 shadow-lg shadow-shield-500/30">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <span className="font-semibold text-white tracking-tight">ShieldGive</span>
              <span className="ml-2 hidden sm:inline text-xs text-slate-500">Private giving · Verifiable impact</span>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>Campaign</NavLink>
            <NavLink to="/gallery" className={linkClass}>Proof Gallery</NavLink>
            <NavLink to="/agent" className={linkClass}>Processing Agent</NavLink>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<CampaignPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/agent" element={<AgentDashboard />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        ShieldGive · Private Zcash giving + Solana contribution proofs
      </footer>
    </div>
  );
}
