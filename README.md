# ShieldGive

**Private Donation Proof via Zcash + Automatic Solana NFT Minting**

> MVP built for the **Colosseum Crypto World's Fair — Zcash Track**

ShieldGive lets donors support campaigns through **shielded Zcash transactions** (identity and amount stay private on-chain) while automatically receiving a **collectible NFT proof** on Solana — with zero manual claiming.

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
3. A background **agent** continuously monitors the shielded pool using a viewing key.
4. When a valid payment is detected, the agent **automatically mints** an NFT proof to the donor’s Solana wallet.
5. The campaign gallery shows total raised **without revealing any donor identities**.

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
| Zcash              | Viewing key + light client (mocked for demo) |
| Solana             | `@metaplex-foundation/js` / UMI     |
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
├── docs/
│   └── SPEC.md             # Full product specification
├── .env.example
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
git clone https://github.com/wadezigh96/shieldgive.git
cd shieldgive

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
ZCASH_VIEWING_KEY=your_viewing_key_here   # or leave empty for mock mode
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=...                    # for mint authority (demo)
CAMPAIGN_SHIELDED_ADDRESS=zs1...
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
2. Simulate (or send) a shielded Zcash donation.
3. Watch the **Agent Dashboard** log: detection → validation → mint triggered.
4. NFT appears in the donor’s Solana wallet.
5. Gallery updates total raised — no donor identities shown.

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
Single demo campaign • Polling agent • Viewing-key verification (testnet/mock) • Metaplex mint

**Post-Hackathon**  
Multi-campaign platform • Creator dashboard • Real-time detection (webhooks / light client events) • Production viewing-key management

**Long-term**  
Multi-chain NFT support • Native Zcash wallet integration • Conditional agent logic (milestones, tiers)

---

## License

MIT

---

Built with ❤️ for privacy-preserving public goods funding.
