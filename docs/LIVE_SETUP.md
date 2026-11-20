# ShieldGive — Live Setup Runbook (testnet / mainnet)

How to run ShieldGive for real: a real shielded ZEC donation → agent detection → real Solana NFT mint. This runbook is written from the live regtest/devnet proof (`live-proof/LIVE_PROOF.md`).

## 1. What you need

| Piece | Testnet path | Mainnet path |
|---|---|---|
| Zcash receiving | Your own `zcashd` on **testnet** (same setup as regtest, just `-testnet`), or a hosted Zcash RPC that supports `z_listreceivedbyaddress` + viewing keys | Your own `zcashd` on **mainnet**, or a hosted RPC (e.g. a node provider with Zcash support). A plain block explorer API is **not** enough — the agent needs `z_listreceivedbyaddress` against the campaign address. |
| Campaign shielded address | Sapling `zs...` testnet address (`ztest sapling...`) from your node | Sapling `zs1...` mainnet address from your node |
| Viewing key | `z_exportviewingkey <campaign address>` — safe to give the backend/host; it can **see** incoming payments but **cannot spend**. Never give the spending key / seed anywhere. | Same |
| Solana minter keypair | Devnet keypair funded with ~2 SOL from https://faucet.solana.com (needs browser + captcha) | Mainnet keypair funded with real SOL (mint + rent, roughly 0.01–0.05 SOL per NFT + fees). Generate it yourself, fund it yourself, paste the base58 secret into `backend/.env` on the server only. |
| Backend hosting | Any always-on host (VPS, Render, Railway, Fly.io). Backend must stay running: storage is **in-memory**, so a restart loses donors/donations/logs. | Same — and put it behind HTTPS. |
| Frontend | Set `VITE_API_URL` to the backend's public URL before `npm run build`. | Same |

## 2. Environment (`backend/.env` — local/server only, never commit)

```env
# Zcash
ZCASH_MODE=live
ZCASH_RPC_URL=http://127.0.0.1:18232        # testnet default port is 18232; mainnet is 8232
ZCASH_RPC_USER=<your rpcuser>
ZCASH_RPC_PASSWORD=<your rpcpassword>
CAMPAIGN_SHIELDED_ADDRESS=<zs campaign address>
ZCASH_MIN_CONFIRMATIONS=1                  # raise to 3+ on mainnet for safety

# Solana
SOLANA_MODE=live
SOLANA_RPC_URL=https://api.devnet.solana.com   # mainnet: https://api.mainnet-beta.solana.com (or a paid RPC for reliability)
SOLANA_PRIVATE_KEY=<base58 minter secret — server only>
SOLANA_NFT_METADATA_URI=https://raw.githubusercontent.com/wadezigh96/ShieldGive/main/metadata/donation-proof.json

# Agent
POLL_INTERVAL_SECONDS=10
PORT=3001
```

Checklist before starting: `backend/.env` is gitignored (repo `.gitignore` line `.env`); `GET /api/agent/status` must show `mockZcash=false, mockSolana=false`.

## 3. Zcash node setup (testnet example)

```bash
# Install zcashd 6.x (see live-proof §5 for the apt/zodl quirks), then:
# zcash.conf (testnet):
#   testnet=1
#   server=1
#   rpcuser=<random> / rpcpassword=<random>
#   rpcport=18232
#   i-am-aware-zcashd-will-be-replaced-by-zebrad-and-zallet-in-2025=1
zcashd -testnet -daemon
zcash-cli -testnet getblockchaininfo   # wait for sync (testnet sync takes a while)
zcash-cli -testnet z_getnewaddress sapling   # campaign address (allowdeprecated may be needed on 6.x)
zcash-cli -testnet z_exportviewingkey <address>  # viewing key for the docs
```

Notes from the live proof:
- On zcashd 6.x, Sapling may need explicit activation on regtest (`nuparams=<branch-id>:1`); on testnet/mainnet it is already active — no nuparams needed.
- `z_sendmany` privacy policies: sending from a transparent address to shielded needs `AllowRevealedSenders` (and exact amounts to avoid transparent change); shielded→shielded works with the default policy. Fee `0.0002` ZEC worked for a 1–2 action tx; `0.0001` failed the ZIP-317 unpaid-action limit.
- Donation memo: the donor's wallet must attach memo exactly `donor=<donorId>` (max 512 bytes). The agent's regex accepts `donor:` / `donor=` forms.

## 4. Run the backend

```bash
cd backend
npm install
npm run build        # tsc — must pass clean
node dist/index.js   # listens on :3001
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/agent/status   # mockZcash=false, mockSolana=false
```

## 5. End-to-end check (do this on testnet before mainnet)

1. Register a donor: `POST /api/register {"solanaWallet":"<donor Solana address>","note":"..."}` → note the returned `id`.
2. Send a shielded donation to the campaign address with memo `donor=<id>`.
3. Wait ~30 s (poll interval 10 s), then `GET /api/donations` → expect `status: "minted"` + `nftMintAddress` + Solana signature.
4. Verify independently on Solana: `getAccountInfo` on the mint address (Mint account must exist) and its Metaplex metadata account.
5. Negative control: one donation with no memo → expect `status: "failed"`, error `Donation memo missing ShieldGive donor code`, no mint.

## 6. Mainnet warnings

- **Real money:** mainnet ZEC donations are irreversible; test the full flow on testnet/devnet first, with the exact same backend build.
- **Key safety:** the minter Solana secret and the Zcash RPC password live only in `backend/.env` on the server. Never paste them in chat, never commit them. The Zcash spending key stays in the node's wallet — the backend only needs RPC access + the viewing key.
- **Confirmations:** set `ZCASH_MIN_CONFIRMATIONS=3` (or higher) on mainnet; `1` is fine for testnet/devnet demos.
- **Metadata URI:** `metadata/donation-proof.json` must be pushed to GitHub first, otherwise the NFT's metadata link is a 404 (minting still works, the link just doesn't resolve).
- **In-memory storage:** a backend restart wipes donors/donations/logs. For anything beyond a demo, add persistent storage before launch.
- **Duplicate failed records:** if a mint fails, each poll tick appends a new failed donation record for the same txid (observed in the live proof). Dedupe before relying on `totalDonations` for reporting.
