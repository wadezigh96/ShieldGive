# ShieldGive — Product Specification (MVP)

**Private Donation Proof via Zcash + NFT on Solana (with Automated Agent)**  
Colosseum Crypto World's Fair — Zcash Track

---

## 1. Problem

On-chain donations permanently expose transaction history (amount + donor identity) on public block explorers. This deters donors supporting sensitive creators, activists, or campaigns. Privacy-conscious donors who use shielded transactions usually receive no collectible proof of contribution.

## 2. Solution

ShieldGive enables donations via **Zcash shielded transactions** (identity and amount remain private) and **automatically** verifies payment then mints an **NFT proof** to the donor’s Solana wallet — with zero manual intervention.

## 3. Why This Opportunity

- New track → lower competition than pure Solana/Ethereum tracks
- Dual prize eligibility (Zcash track + general top-21 pool)
- Rare combination of privacy + NFT + automation → highly differentiated

## 4. Core MVP Features

| # | Feature                     | Description                                                                 |
|---|-----------------------------|-----------------------------------------------------------------------------|
| 1 | Campaign Page               | Creator sets up one campaign: title, description, shielded Zcash address    |
| 2 | Donation Instructions       | Displays shielded address + how to donate with existing Zcash wallets       |
| 3 | Automated Monitoring Agent  | Background process polls incoming transactions via viewing key              |
| 4 | Automatic Minting           | On valid payment detection → immediately mints NFT to registered Solana wallet |
| 5 | Donor Wallet Registration   | Donor submits Solana address once (before or at donation time)              |
| 6 | NFT Gallery                 | Shows total raised + campaign NFT collection without revealing donors       |

## 5. Manual vs Agent Comparison

| Before (Manual)                          | After (Automated Agent)                                      |
|------------------------------------------|--------------------------------------------------------------|
| Donor clicks “check payment status”      | System polls every N minutes and detects payments itself     |
| Donor pastes transaction reference to claim | NFT is minted automatically as soon as payment is validated |

> Note: This is **not** an LLM agent that “reasons”. It is a deterministic scheduled job that executes a fixed pipeline: check → validate → mint. Low complexity, high demo value.

## 6. Explicitly Out of Scope for MVP

- Multi-campaign / multi-creator platform
- Custom ZK circuits (use native Zcash shielded transactions)
- Wallet abstraction / from-scratch wallets
- Complex decision logic inside the agent
- Automatic ZEC → fiat withdrawal

## 7. Technical Stack

| Component          | Role                                                                 |
|--------------------|----------------------------------------------------------------------|
| Frontend           | Simple web app (campaign, registration, gallery) — React/Vite        |
| Backend + Agent    | Node.js + TypeScript + `node-cron` — polls Zcash, triggers Solana mint |
| Zcash              | Shielded transactions + viewing key                                  |
| Solana             | Metaplex for minting donation-proof NFTs                             |

## 8. System Flow

1. Donor registers Solana wallet on the campaign page.
2. Donor sends ZEC to the campaign’s shielded address.
3. Backend agent periodically checks for new transactions via viewing key.
4. On valid payment → agent triggers minting.
5. NFT is minted to the donor’s Solana wallet via Metaplex.
6. Gallery displays total raised (no donor identities).

## 9. Demo Script (~2 minutes)

1. Show campaign page → donor registers Solana wallet.
2. Donor sends donation via Zcash (testnet or pre-recorded).
3. Show agent working in background — logs of automatic detection.
4. NFT appears in donor’s Solana wallet.
5. Show gallery: total visible, identities hidden.

## 10. Implementation Order (for coding assistants)

1. Set up Solana + Metaplex and test static NFT mint (no Zcash yet).
2. Connect to Zcash testnet / light client and test reading with viewing key.
3. Build simple scheduled job (poll every N minutes) that checks for new transactions.
4. Wire detection → automatic Solana mint trigger.
5. Build frontend (3 pages: campaign, registration, gallery).
6. Add lightweight agent activity log/dashboard for demo.
7. Polish copy, minimal styling, and pitch materials.

## 11. Post-Hackathon Roadmap

- **Now:** 1 demo campaign, simple polling agent, viewing-key verification on testnet
- **After:** Multi-campaign platform, creator dashboard, real-time detection
- **Long-term:** Multi-chain NFT support, native Zcash wallet integration, conditional agent logic (milestones, tiers)
