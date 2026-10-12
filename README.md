# ShieldGive

**Private Donation Proof via Zcash + Solana proof infrastructure**

> MVP built for the **Colosseum Crypto World's Fair — Zcash Track**

ShieldGive demonstrates a privacy-focused donation workflow using **shielded Zcash transactions** and a Solana proof layer. The public demo clearly separates deterministic mock processing from planned live Zcash detection and Solana minting.

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
| Zcash              | Viewing key + light client (mocked for public demo) |
| Solana             | Metaplex / UMI intended for live minting; demo uses local proof records |
| Database (development/test) | In-memory store for quick deterministic tests | 
| Database (production) | PostgreSQL with unique source-transaction IDs and atomic mint claims |

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
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
DB_POOL_MAX=5
ZCASH_MODE=live
ZCASH_RPC_URL=http://127.0.0.1:8232
ZCASH_RPC_USER=
ZCASH_RPC_PASSWORD=
ZCASH_MIN_CONFIRMATIONS=1
CAMPAIGN_SHIELDED_ADDRESS=zs1...
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=...                    # devnet-only key for testing
SOLANA_NFT_METADATA_URI=https://...       # immutable/public metadata JSON
SOLANA_LIVE_MINT_ENABLED=false             # keep disabled until deliberate live test
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

## Durable Storage, Idempotency, and Recovery

Production requires a PostgreSQL `DATABASE_URL`. The backend creates its initial tables on startup and **refuses to start in production without the database URL** instead of silently losing registrations and donations in process memory. In-memory storage is only for local development and tests. Keep a long-running Node.js backend for the polling agent; do not rely on a short-lived serverless request to keep a cron worker alive.

The database enforces a unique Zcash source transaction ID for each donation. Before calling the Solana minter, the worker must atomically claim the donation by changing its status from `validated` to `minting`; concurrent backend instances cannot both claim the same record. The NFT mint signature is stored privately alongside the mint address when confirmation succeeds.

A blockchain transaction and a database write cannot be made one atomic transaction. If a live RPC submission may have reached Solana but confirmation is missing, ShieldGive marks the donation `mint_unknown` (or leaves a claimed `minting` record after an abrupt restart) and blocks automatic retry. This intentionally prioritizes avoiding duplicate NFT mints over automatic recovery. Verify the Solana signature / mint account on-chain and reconcile the record before manually retrying. Check `GET /api/agent/status`; `reconciliationRequired` counts donations that need that review.

Production environment:
- Set `DATABASE_URL` to the PostgreSQL URL from the selected provider and protect it as a secret.
- Start with `SOLANA_LIVE_MINT_ENABLED=false`. Do not enable live minting until the selected Solana network, metadata URI, recipient, mint authority, and RPC have been verified.
- Do not treat the public receipt as a bridge or a claim that funds moved between chains; the receipt only binds a source donation observation to a Solana proof.
- Public production API responses omit donor wallet/note, raw Zcash tx IDs, private receipt linkage, log metadata, and the stored mint signature.

Run checks:
```bash
cd backend
npm install
npm run typecheck
npm run test:production-api-safety
npm run test:mock-e2e
npm run test:zcash-mock-rpc
```


If a live mint gets an ambiguous RPC outcome, ShieldGive deliberately does not retry it automatically. First independently locate and verify the Solana transaction in the correct network explorer, then reconcile using the persisted donation ID and mint candidate. The command re-queries the configured RPC and requires a confirmed successful transaction with the candidate mint owned by the registered recipient; it does not send a transaction.

Example (after setting the environment variables to values you verified on-chain):
```bash
cd backend
export SHIELDGIVE_RECONCILE_DONATION_ID="the-donation-id-from-private-logs"
export SHIELDGIVE_RECONCILE_MINT_ADDRESS="the-persisted-mint-candidate"
export SHIELDGIVE_RECONCILE_SIGNATURE="the-confirmed-solana-transaction-signature"
export SHIELDGIVE_RECONCILE_CONFIRM="CONFIRM_RECONCILED_ONCHAIN_MINT"
npm run reconcile:solana-mint
```
This requires the same durable `DATABASE_URL`, explicit `SOLANA_NETWORK` and `SOLANA_RPC_URL`, and a confirmed transaction whose post-token balance contains one zero-decimal token owned by the stored recipient. On mainnet it also requires `SOLANA_MAINNET_LIVE_MINT_ACK=I_UNDERSTAND_MAINNET_MINTING`. Never run against a production database until the transaction and network have been checked carefully.

The PostgreSQL integration test requires a disposable test database:
```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/TEST_DATABASE npm run test:storage-postgres
```

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


## Solana Devnet Test

ShieldGive keeps live Solana minting disabled by default. For the first real-chain experiment, use **Solana Devnet**, not Mainnet.

Required environment:

```env
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=<devnet-only-mint-authority>
SOLANA_TEST_RECIPIENT=<Solana-recipient>
SOLANA_NFT_METADATA_URI=https://<your-https-metadata-uri>
```

Run the no-broadcast preflight:

```bash
cd backend
npm install
npm run test:solana-devnet-preflight
```

The preflight checks the Devnet RPC, mint-authority key format, recipient address, metadata URI, and authority balance. It **does not create an NFT or broadcast a transaction**.

Devnet SOL is test-only and can be obtained from a Solana faucet. Public Devnet RPC is intended for development/testing and is rate-limited.
