# ShieldGive

**Private Donation Proof via Zcash + Solana proof infrastructure**

> MVP built for the **Colosseum Crypto World's Fair — Zcash Track**

ShieldGive demonstrates a privacy-focused donation workflow using **shielded Zcash transactions** and a Solana proof layer. The public demo clearly separates deterministic mock processing from live Zcash detection and Solana minting.

## Status

- ✅ **Live end-to-end proof executed (2026-11-20):** a real shielded Zcash donation (regtest) was detected by the agent, correlated by its memo, and minted as an NFT on Solana devnet — verified independently via devnet RPC. Full evidence: [live-proof/LIVE_PROOF.md](live-proof/LIVE_PROOF.md)
- 🌐 **Public demo:** https://shield-give.vercel.app — runs in clearly labeled demo mode (mock Zcash/Solana). Live mode is configured via `backend/.env`; see [docs/LIVE_SETUP.md](docs/LIVE_SETUP.md).
- 🚧 Originally built for the Colosseum Crypto World's Fair (Zcash Track); now being developed further in the **Colosseum Eternal** sprint.

---

## The Problem

Standard on-chain donations permanently expose:
- Donor identity
- Donation amount
- Full transaction history

This discourages support for sensitive creators, activists, and causes.  
Donors who prefer privacy usually receive **no verifiable proof** they can collect or display.

## The Solution

1. Donor registers their Solana wallet once.
2. Donor sends ZEC via a **shielded address**.
3. A background **agent** is designed to monitor the shielded pool using a viewing key.
4. When a valid payment is detected, the agent creates a contribution proof; the public demo uses a deterministic mock proof until live Solana minting is configured.
5. The campaign gallery shows totals and clearly labels demo vs live proof records.

No manual “claim” button. No transaction hash pasting. Fully automatic.

---

## Core Features (MVP)

| Feature                    | Description                                      |
|---------------------------|--------------------------------------------------|
| Campaign Page             | Single demo campaign with title, description, and shielded Zcash address |
| Donor Wallet Registration | Donor submits Solana address once                |
| Automated Monitoring Agent| Background worker polls shielded transactions via viewing key |
| Automatic NFT Minting     | Triggers Metaplex mint as soon as payment is confirmed |
| Public Gallery            | Shows total donations + NFT collection (privacy-preserving) |
| Agent Activity Dashboard  | Real-time logs of detection → validation → mint  |

---

## Architecture Overview

```
┌─────────────────┐     Shielded TX      ┌──────────────────────┐
│  Zcash Wallet   │ ──────────────────►  │  Shielded Address    │
└─────────────────┘                      └──────────┬───────────┘
                                                    │
                                                    ▼
┌─────────────────┐     Viewing Key      ┌──────────────────────┐
│  Donor (Solana) │ ◄─── NFT Minted ──── │  Backend Agent       │
└─────────────────┘                      │  (node-cron worker)  │
                                         └──────────────────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  Metaplex / Solana   │
                                         └──────────────────────┘
```

**Important:** The “agent” is a deterministic scheduled job, not an LLM-based AI.  
It runs a fixed pipeline: **poll → validate → mint**.  
This keeps complexity low while still demonstrating autonomous execution for the judges.

---

## Tech Stack

| Layer              | Technology                          |
|--------------------|-------------------------------------|
| Frontend           | React + Vite + Tailwind CSS         |
| Backend + Agent    | Node.js + TypeScript + Express      |
| Scheduling         | `node-cron`                         |
| Zcash              | Viewing key + zcashd RPC polling (live proven on regtest; mocked in public demo) |
| Solana             | Metaplex / UMI live minting (proven on devnet); demo uses local proof records |
| Database (demo)    | In-memory / JSON file               |

---

## Project Structure

```
shieldgive/
├── backend/
│   ├── src/
│   │   ├── agent/          # Scheduled monitoring & minting pipeline
│   │   ├── services/       # Zcash watcher, Solana minter, storage
│   │   ├── routes/         # REST API
│   │   ├── types/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── ...
│   ├── package.json
│   └── ...
├── docs/                   # SPEC.md, LIVE_SETUP.md, SUBMISSION.md, DEMO_VIDEO_GUIDE.md
├── live-proof/             # Executed live E2E proof: regtest Zcash → Solana devnet (LIVE_PROOF.md)
├── metadata/               # NFT metadata JSON
├── backend/.env.example
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- (Optional) Solana CLI + wallet for real minting
- (Optional) Zcash lightwalletd or testnet node for real shielded monitoring

### 1. Clone & Install

```bash
git clone https://github.com/wadezigh96/ShieldGive.git
cd ShieldGive

# Backend
cd backend
npm install
cp .env.example .env

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment

Edit `backend/.env`:

```env
PORT=3001
POLL_INTERVAL_SECONDS=30
# Demo mode: leave ZCASH_RPC_URL and SOLANA_PRIVATE_KEY empty,
# or set ZCASH_MODE=mock / SOLANA_MODE=mock explicitly.
# Live mode (full guide: docs/LIVE_SETUP.md):
ZCASH_RPC_URL=http://127.0.0.1:8232
ZCASH_RPC_USER=
ZCASH_RPC_PASSWORD=
<MASKED_SECRET_001>
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=...                    # mint authority secret key — NEVER commit this value
SOLANA_NFT_METADATA_URI=https://...       # public URI of the NFT metadata JSON
```

### 3. Run

```bash
# Terminal 1 – Backend + Agent
cd backend
npm run dev

# Terminal 2 – Frontend
cd frontend
npm run dev
```

Open http://localhost:5173

---

## Demo Flow (≈ 2 minutes)

1. Open the campaign page → register a Solana wallet.
2. Register a Solana wallet, then run the demo donation pipeline.
3. Watch the **Agent Dashboard** log: correlation → validation → demo proof created.
4. Open **Proof Gallery** and verify the proof is explicitly labeled **Demo Proof**.
5. For production, live Zcash detection and Solana minting must be configured separately.

---

## What Was Intentionally Skipped (MVP Scope)

- Multi-campaign / multi-creator platform
- Custom ZK circuits (we use native Zcash shielded transactions)
- Wallet abstraction / embedded wallets
- Complex decision-making agent logic
- Automatic ZEC → fiat withdrawal

---

## Roadmap

**Now (Hackathon)**  
Single demo campaign • Polling agent • Live E2E proof: Zcash regtest → Solana devnet ✅ • Metaplex mint (live)

**Post-Hackathon**  
Multi-campaign platform • Creator dashboard • Real-time detection (webhooks / light client events) • Production viewing-key management

**Long-term**  
Multi-chain NFT support • Native Zcash wallet integration • Conditional agent logic (milestones, tiers)

---

Donation: t1Tt3RewpRiUjBx1hbuDnECfYHrD4wswD1b

## License

MIT

---

Built with ❤️ for privacy-preserving public goods funding.
