# ShieldGive — Live End-to-End Proof (regtest Zcash → Solana devnet)

**Date:** 2026-11-20 (UTC)
**Status: ✅ PROVEN LIVE END-TO-END — shielded donation detected + correlated + NFT minted on Solana devnet and verified independently via devnet RPC.**

The first run (12:52 UTC) proved the Zcash side but the mint was blocked on 0 SOL. After the user funded the minter via the faucet captcha (10 SOL) and the stack was restarted (see §10), a second donation completed the full loop at 13:32 UTC.

## 1. What was proven live

| Step | Result |
|---|---|
| zcashd 6.12.2 regtest node, Sapling active | ✅ running, 111 blocks mined |
| Real shielded (Sapling) donation to campaign address | ✅ tx `91ce669756a6737e2b5602802fa55f96ad6232f096b87b51dd8909bbb4a5baf8`, 0.25 ZEC, 1 confirmation (block 111); first run tx `7ca118c5…` also detected+validated |
| Agent detects via `z_listreceivedbyaddress` (viewing-key-capable RPC) | ✅ "New shielded transaction detected" 13:32:05 UTC |
| Memo correlation `donor=<donorId>` | ✅ "Payment validated", donorId `02196eac-157f-484c-9787-ac11def83694` matched |
| NFT mint on Solana devnet | ✅ **MINTED** — mint `66KtaV5A8WxhDekkpcaK4MCNBZS52uM5KrnWWApTnDTJ`, tx `2tAo3snpvwNv6JKpsYgz5Mrg8fZqM1jpuXEbuvRvazPZmGkeGaxCvG6K4w4NWTYyNpiR7cnpiDx9CGa5GwpfKTyf` (slot 524368454, fee 10,000 lamports, err null) |
| Independent devnet verification | ✅ mint account exists (Token program, supply 1, decimals 0), donor holds 1 token, Metaplex metadata account `4awX8JnUPESYywjL6z77UvNGdwHW9upcQ2Rso2Jj68ng` exists (607 bytes) |
| Negative control: donation without memo | ✅ detected, correlation failed, **no mint attempted** |
| Backend live mode | ✅ `mockZcash=false`, `mockSolana=false` |

## 2. Addresses & keys (all throwaway test keys — regtest/devnet only)

- **Campaign shielded address (zs, regtest):** `zregtestsapling1wkxgkm88s8wnn6f32kdlnexlh7d9j4cw3a7t06q9zvzaauerrcvthmexhvqjeyd3rwy4x65fnd0`
- **Campaign viewing key** (safe to share — NOT a spending key):
  `zxviewregtestsapling1qsmkj2zkqqqqpqyvk3hncevv3reh3yhfl70025m3d6wzu27t24d8j5qkrmquw5zvthjf70kdjkhuclf4pt9t3r0ej64p5qdrtcwx0jm9qdjet53y2s5dskgz7ql5857wz82vdjgj4w3yvs353cxk0n6q9j5yyvc3nqza2m3jq0apy8nstln7r6fn43eeuq0772axzrhnjkdxj8aruesap6x7m0hgyzv0q052gh50mk4lrkvp5r9js5wnl52d3tjuhrs0t2t5kfzxflc8gwzjn`
- **Donor shielded address (zs, regtest):** `zregtestsapling1s0xras9z9um2r5cr2d2057csf82z7qgwqq892wd7c82e5nc66j6wd4rv3kc6m2mwwvqwg9kwu9v`
- **Miner / transparent funding address (regtest):** `tmGE9nDR5JXcM5kXp4LRrBoh3qTaF6ageRD`
- **Solana minter (devnet, backend signer):** `F9T1dYAhzf9GhfP1eq7w5R2rCtvmCJwCKdTG4pLjC2CC` — balance **10 SOL** (funded by user via faucet captcha, see §6)
- **Solana donor wallet (devnet):** `3qP5Up4JEqNs1C7JSJaq7iZfXCQUgKw6ErekVhrj5kUE`
- **NFT metadata URI:** `https://raw.githubusercontent.com/wadezigh96/ShieldGive/main/metadata/donation-proof.json` — resolves only **after** `metadata/donation-proof.json` is pushed to GitHub (mint does not fetch the URI, but the link is dead until then).

No spending key or Solana private key is written in this file. The minter secret lives only in local `backend/.env` (gitignored). The regtest wallet (`live-proof/zcash-regtest/regtest/wallet.dat`, contains regtest spending keys) is gitignored via `live-proof/.gitignore` — never publish that directory.

## 3. Zcash transactions (regtest, chain rebuilt 2026-11-20 after enabling Sapling)

| Tx | Purpose | Amount |
|---|---|---|
| `31170b1c312b58fa134451703a10497426cc3c10fdf4a2722f92496aa8862993` | Shield miner coinbase → donor zs (funding) | 6.2498 ZEC |
| `91ce669756a6737e2b5602802fa55f96ad6232f096b87b51dd8909bbb4a5baf8` | **Donation (retry run)** donor zs → campaign zs, memo `donor=02196eac-157f-484c-9787-ac11def83694` | 0.25 ZEC |
| `7ca118c55f836ba8291c00af01e7f92c2dbbe28fa42d2c6b4bcc4eb6097eed50` | **Donation (first run)** donor zs → campaign zs, memo `donor=0bb19296-5146-435f-a328-71506991ca30` | 0.25 ZEC |
| `5d9073fb437f4bbffa2c3c905902cc061724c8126a88cefa04730d5a8cc6f5e7` | **Negative control** donor zs → campaign zs, no memo | 0.1 ZEC |

Memo hex of the retry donation (from `z_listreceivedbyaddress`):
`646f6e6f723d30323139366561632d313537662d343834632d393738372d616331316465663833363934`
= ASCII `donor=02196eac-157f-484c-9787-ac11def83694`.

Mint (Solana devnet), verified independently — see `live-proof/verify-mint.mjs`:
- Mint address: `66KtaV5A8WxhDekkpcaK4MCNBZS52uM5KrnWWApTnDTJ` — [explorer](https://explorer.solana.com/address/66KtaV5A8WxhDekkpcaK4MCNBZS52uM5KrnWWApTnDTJ?cluster=devnet)
- Mint tx: `2tAo3snpvwNv6JKpsYgz5Mrg8fZqM1jpuXEbuvRvazPZmGkeGaxCvG6K4w4NWTYyNpiR7cnpiDx9CGa5GwpfKTyf` — [explorer](https://explorer.solana.com/tx/2tAo3snpvwNv6JKpsYgz5Mrg8fZqM1jpuXEbuvRvazPZmGkeGaxCvG6K4w4NWTYyNpiR7cnpiDx9CGa5GwpfKTyf?cluster=devnet) — slot 524368454, fee 10,000 lamports, err null
- Mint account: owner `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, supply 1, decimals 0, initialized
- Donor `3qP5Up4JEqNs1C7JSJaq7iZfXCQUgKw6ErekVhrj5kUE` holds exactly 1 token of this mint
- Metaplex metadata account `4awX8JnUPESYywjL6z77UvNGdwHW9upcQ2Rso2Jj68ng` exists (607 bytes, owner `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`)
- Backend log: "NFT minted on Solana" 13:32:48 UTC, then "Donation proof NFT minted & campaign updated", totalRaisedZEC 0.25; later ticks log "Skipping successfully processed tx" for `91ce6697…`

## 4. Backend (live mode)

- `GET /health` → `{"status":"ok","service":"shieldgive-backend"}`
- `GET /api/agent/status` → `{"mockZcash":false,"mockSolana":false,"pollIntervalSeconds":10,"totalDonations":12,"registeredDonors":1}` (totalDonations grows by 1 per 10 s tick while the mint keeps failing — see §7)
- `GET /api/campaign` → campaign with the regtest shielded address above
- Donor registered (retry run): `POST /api/register {"solanaWallet":"3qP5Up4JEqNs1C7JSJaq7iZfXCQUgKw6ErekVhrj5kUE","note":"live-proof donor retry"}` → id `02196eac-157f-484c-9787-ac11def83694` (first run id was `0bb19296-5146-435f-a328-71506991ca30`, lost with the in-memory restart — see §10)
- Agent logs for the good donation (12:52:14–12:52:50 UTC): "New shielded transaction detected" → "Payment validated" (donorId matched) → "Starting NFT mint" → "Live Solana NFT mint failed" → "NFT mint failed — transaction remains retryable"
- Agent logs for the negative control: "New shielded transaction detected" (0.1 ZEC) → "Payment detected but donor correlation failed — NFT not minted", donation record error: `Donation memo missing ShieldGive donor code`, **no mint attempt**.

## 5. zcashd 6.12.2 quirks encountered (regtest)

1. **Deprecation ack required:** zcashd refuses to start without `i-am-aware-zcashd-will-be-replaced-by-zebrad-and-zallet-in-2025=1` in `zcash.conf`.
2. **Deprecated RPCs disabled by default:** `getnewaddress`, `z_getnewaddress`, `z_getbalance` need `-allowdeprecated=<method>` in conf.
3. **`generatetoaddress` does not exist in 6.12** — use `generate <n>` (mines to wallet keypool address). Coinbase matures after 100 blocks; regtest subsidy is 6.25 ZEC/block here.
4. **Sapling NOT active by default on regtest in 6.12** — `z_sendmany` fails with "Cannot create shielded transactions before Sapling has activated". Fix: `nuparams=<branch-id>:1` in conf (branch IDs, not names — names are rejected as "Invalid network upgrade"). Used: `5ba81b19:1` (Overwinter), `76b809bb:1` (Sapling), `2bb40e60:1` (Blossom), `f5b9230b:1` (Heartwood), `e9ff75a6:1` (Canopy). NU5's branch ID `37519621` is **wrong** (rejected) — not needed, omitted.
5. **Changing nuparams after blocks exist breaks the chain** ("block index inconsistency detected") — the datadir had to be wiped and the chain re-mined from 0 (wallet.dat lives in `regtest/wallet.dat`, so it was wiped too; all addresses were regenerated).
6. **Privacy policy ladder** (zcashd 6.12): t→zs from coinbase needs `privacyPolicy=AllowRevealedSenders` (and an exact-amount send to avoid transparent change, which needs yet another policy). `AllowLinking` is **not** a valid policy name. Shielded→shielded works with the default policy.
7. **ZIP-317 fee:** fee `0.0001` fails with "tx unpaid action limit exceeded: 1 action(s) exceeds limit of 0"; fee `0.0002` works. Fee `0.01` is rejected as >4× conventional fee.
8. **Daemon + pipes:** never pipe `zcashd -daemon` into `tail`/`head` — the daemon keeps the pipe open and the shell hangs. Redirect to a file or `/dev/null`.

## 6. BLOCKER — Solana devnet SOL (faucet) — ✅ RESOLVED 20:28 WIB

The mint failed in the first run only because the minter account had **0 SOL**:

> `Transaction simulation failed: This account may not be used to pay transaction fees.`

Verified minter balance on devnet: `0` lamports (2026-11-20 12:53 UTC, slot 524358761).

Attempts to fund it (all failed, 2–3 tries each, then stopped per instructions):
1. `requestAirdrop` via `https://api.devnet.solana.com` — **410 Gone: "The RPC faucet is closed on this cluster. Request test SOL at https://faucet.solana.com"** (6 retries).
2. `requestAirdrop` via Ankr public devnet RPC (`https://rpc.ankr.com/solana_devnet`) and Alchemy demo (`https://solana-devnet.g.alchemy.com/v2/demo`) — both **timed out (30 s, no response)** from this VM.
3. `POST https://faucet.solana.com/api/request` with `cloudflareCallback: null` — no SOL delivered (minter balance still 0 afterwards). The faucet's own JS shows the API **requires a Cloudflare Turnstile captcha token** (`cloudflareCallback`) — it cannot be completed from the command line.
4. Browser task at faucet.solana.com (2.5 SOL, Devnet, minter address) — form filled and "Confirm Airdrop" clicked, but the Cloudflare Turnstile checkbox **failed 4 times** across two browsers ("Verifikasi gagal", widget resetting to unchecked). The cloud browser could not clear it.

**Resolution:** Ibet solved the Turnstile captcha himself in the live browser at ~20:28 WIB. Verified afterwards via devnet RPC `getBalance`: minter balance **10 SOL** (10,000,000,000 lamports, slot 524367575) — more than the 2.5 SOL requested, exact faucet behavior not investigated further. The retry donation (§3) then minted successfully on the next agent tick.

## 7. Observations (not blockers)

- **Duplicate failed records:** while the mint keeps failing, each 10 s tick appends a *new* failed donation record for the same txid (12 records for `7ca118c5…` so far). This follows the design ("tx is only marked processed after a successful mint"), but the retry creates a new record instead of updating the existing one. Cosmetic; worth a dedupe pass before a real launch.
- **Backend startup:** `npm run build` (`tsc`) passes clean; `node dist/index.js` listens on :3001. Logs in `live-proof/backend.log`.
- **Storage is in-memory** — restarting the backend loses donors/donations/logs. The regtest chain and wallet survive restarts (datadir), but the backend state does not.

## 8. Limitations (honest)

- Zcash side is **regtest** (local, no sync) — protocol-identical shielded Sapling flow, but not testnet/mainnet.
- Solana side is **devnet** — real network, test SOL only.
- NFT metadata URI (`raw.githubusercontent.com/.../metadata/donation-proof.json`) returns 404 until that file is pushed to GitHub.
- In-memory backend storage (see §7).
- The campaign viewing key in §2 is verified against `live-proof/zcash-regtest-info.json` (same value).

## 9. Files

- `live-proof/LIVE_PROOF.md` (this file)
- `live-proof/e2e-result.json` — raw result data
- `live-proof/zcash-regtest-info.json` — campaign/donor zs addresses + viewing key (public only)
- `live-proof/solana-keypairs-public.json` — devnet public addresses
- `live-proof/solana-setup.mjs` — keypair generation + airdrop script
- `live-proof/verify-mint.mjs` — independent devnet verification (mint account, token balance, metadata PDA, tx)
- `live-proof/backend.log` — backend stdout
- `live-proof/zcash-bin/` — zcashd 6.12.2 binaries (sha256 `75947c7d…` + ZODL GPG verified, kept in home dir so a VM restart doesn't lose them again)
- `metadata/donation-proof.json` — NFT metadata (name "ShieldGive Donation Proof", symbol SGIVE)
- `backend/.env` — local only, gitignored (contains minter secret + regtest RPC password; never commit)
- `docs/LIVE_SETUP.md` — testnet/mainnet runbook for Ibet

## 10. Restart / recovery (20:28–20:35 WIB)

Between the first run and the faucet funding, the VM restarted (or the processes were reaped): both zcashd and the backend were dead, and the zcashd binary (extracted under `/tmp`) was gone. What survived: the regtest datadir + wallet (block 110, balances intact), `backend/.env`, and all proof files.

Recovery, all verified:
1. Re-downloaded `zcash-6.12.2-linux64-debian-bookworm.tar.gz` from `https://download.z.cash/downloads/` — sha256 matched the official `75947c7d…` and the detached GPG signature verified against the ZODL key (`0338 34DD 49DE CF9D BB99 34BC 6C93 CA8E 58E2 6AB1`) — extracted to persistent `live-proof/zcash-bin/`.
2. Restarted zcashd regtest on the old datadir: block 110, wallet balances intact (transparent 56.25, private 6.2494 ZEC), both zs addresses present.
3. Restarted the backend (`node dist/index.js`, :3001): live mode again (`mockZcash=false`, `mockSolana=false`).
4. Because backend storage is in-memory, the donor registry was lost — the old donation's memo referenced the old donor id, so it could never correlate again. A **new** donation was sent with a fresh donor id (`02196eac…`) — that is the tx in §3 that minted.

**Nothing was pushed to GitHub. No user keys/seeds were used. No mainnet funds were touched.**

## 11. Dedupe fix + second mint (13:49–13:52 UTC)

The duplicate-record bug from §7 was fixed and proven with a second full loop:
- **Fix** (`backend/src/agent/pipeline.ts` + `backend/src/services/storage.ts`): `processIncomingTx` now looks up an existing record by txid (`findDonationByTxId`) and updates it to `pending` instead of appending a new one on every retry tick.
- **Verification:** after restarting the backend with the fix, total donation records stayed at **4 across multiple ticks** (exactly 1 record per txid: `f5fe41dc`, `91ce6697`, `5d9073fb`, `7ca118c5`) — previously it grew by 1 per 10 s tick.
- **Second mint:** new donor id `b4a61929-c2b6-4f49-87ed-a39edf2cc00e`, donation tx `f5fe41dcce5e6f87b12d869aece6611ac49d7d154f5688c80a6511bb6a4ec37e` (0.25 ZEC, block 112) → minted 13:52:52 UTC. Mint `GNnfvesCJUn24Wzwek6ndTpUfuN1DNZYG8hn35reBiWA` — [explorer](https://explorer.solana.com/address/GNnfvesCJUn24Wzwek6ndTpUfuN1DNZYG8hn35reBiWA?cluster=devnet), tx `5UAAdSrtsTQhk2RVqaSnj83pX48hteWMkRuzR8LG2p3KEZSEoVgwRsRbcsUGm3aef2NuaDF1QXec8NxBR2L3uovn` — [explorer](https://explorer.solana.com/tx/5UAAdSrtsTQhk2RVqaSnj83pX48hteWMkRuzR8LG2p3KEZSEoVgwRsRbcsUGm3aef2NuaDF1QXec8NxBR2L3uovn?cluster=devnet) (slot 524373550, fee 10,000 lamports, err null); metadata PDA `Gf1ypFkq5P7ENJYBJG7MAsoK67XWb3UioN1iLi7R9J7Z` exists (607 bytes). Verified independently with `live-proof/verify-mint2.mjs`.
- Note: a mint can take ~90 s to confirm on devnet (this one: detected 13:49:49, minted 13:52:52); while a mint is in flight the agent skips further ticks, so the dashboard briefly shows `validated`.
