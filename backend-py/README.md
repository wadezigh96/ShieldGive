# ShieldGive Backend — Python Port

A Python (FastAPI) port of the ShieldGive backend, mirroring the
TypeScript implementation in [`backend/`](../../) endpoint-for-endpoint
and log-for-log. It exists as an **additional implementation** — the
TypeScript backend remains the live/submission version.

The agent is deterministic (no LLM): **poll → validate (memo
correlation `donor=<donorId>`) → mint → update campaign totals**, on a
background loop, exactly like the TS pipeline.

## Run it

```bash
cd backend-py
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cp .env.example .env        # or export the variables directly

# Mock/demo mode (no Zcash node, no Solana key needed):
ZCASH_MODE=mock SOLANA_MODE=mock PORT=3009 .venv/bin/python run.py
# …or: .venv/bin/python -m uvicorn app.main:app --port 3009
```

Requires Python 3.11+.

## Configuration

Identical env vars to the TS backend — see [`.env.example`](.env.example)
(`PORT`, `POLL_INTERVAL_SECONDS`, `ZCASH_MODE`, `ZCASH_RPC_URL/USER/PASSWORD`,
`ZCASH_MIN_CONFIRMATIONS`, `ZCASH_RPC_METHOD`, `CAMPAIGN_SHIELDED_ADDRESS`,
`SOLANA_MODE`, `SOLANA_RPC_URL`, `SOLANA_PRIVATE_KEY`,
`SOLANA_NFT_METADATA_URI`, `SOLANA_NFT_NAME`, `SOLANA_NFT_SYMBOL`; the
TS-only-in-code `ZCASH_RPC_PARAMS` override is supported too).

Mock-mode fallback rules are the same as TS:

- **Zcash** is mock when `ZCASH_MODE=mock`, or `ZCASH_RPC_URL` is unset,
  or `CAMPAIGN_SHIELDED_ADDRESS` is unset or starts with `zs1demo`.
- **Solana** is mock when `SOLANA_MODE=mock`, or `SOLANA_PRIVATE_KEY` is
  unset or literally `mock`.

## Endpoint parity vs the TS backend

| Endpoint | TS | Python | Notes |
|---|---|---|---|
| `GET /health` | ✅ | ✅ | Same un-enveloped body: `{"status":"ok","service":"shieldgive-backend"}` |
| `GET /api/campaign` | ✅ | ✅ | Same fields, `{success, data}` envelope |
| `POST /api/register` | ✅ | ✅ | 201; same zod-style validation (see below) |
| `GET /api/donors` | ✅ | ✅ | Insertion order, wallet-uniqueness returns existing |
| `GET /api/donations` | ✅ | ✅ | Newest first |
| `GET /api/agent/logs` | ✅ | ✅ | `?limit=` default 40, capped at 100, newest first, 200 kept |
| `GET /api/agent/status` | ✅ | ✅ | Includes the TS quirk: `mockSolana` ignores `SOLANA_MODE` |
| `POST /api/agent/simulate` | ✅ | ✅ | 201; runs the full pipeline synchronously, like TS |
| Unknown path | ✅ | ✅ | `404 {"success":false,"error":"Not found"}` |

Validation errors reproduce zod's `err.flatten()` shape —
`{"formErrors":[...],"fieldErrors":{"solanaWallet":["String must contain at least 32 character(s)"]}}`
— with zod's message wording for the constraints used (string length,
positive/≤1000 amount). Agent log messages, the memo-correlation regex,
the processed-tx dedupe/retry behavior, and the mock mint address format
(`mint_<first 16 of donation id>`) are all identical to TS.

## What differs — honestly

- **Solana live mint: implemented, but not live-proven.** The TS version
  mints through Metaplex UMI (JS-only). This port builds the equivalent
  transaction by hand with `solders`: create mint account → initialize
  mint (0 decimals) → Metaplex `CreateMetadataAccountV3` → create the
  recipient's associated token account → mint 1 token →
  `CreateMasterEditionV3` (max supply 0), signed by the payer + mint
  keypair and confirmed via `getSignatureStatuses`. The transaction
  construction has been verified **offline** (a real 785-byte signed
  transaction is produced; only the network send was stubbed in that
  check). It has **not** been run against a funded key on a live
  cluster, so treat it as unproven until someone does. Any failure —
  bad key, missing `SOLANA_NFT_METADATA_URI`, RPC or on-chain error —
  is logged (`Live Solana NFT mint failed`) and returned as
  `success: false`. It **never** fabricates a mint address.
- **Signature format:** TS returns the mint signature base64url-encoded;
  this port returns the conventional base58 string. The signature is
  only used in logs — the frontend stores `mintAddress`, which matches.
- **Scheduler:** node-cron is replaced by an asyncio loop started on
  app startup; tick timing matches (intervals ≥ 60 s round down to
  whole minutes, minimum 10 s, one immediate tick at boot).
- **HTTP plumbing:** RPC clients use `trust_env=False` because Node's
  fetch ignores proxy env vars — a local zcashd/Solana RPC is never
  routed through a proxy.
- Storage is in-memory in both versions (state resets on restart);
  the campaign/donor/donation/log semantics are otherwise identical.

## Layout

```
run.py               entrypoint (PORT-aware uvicorn runner)
app/
  main.py            FastAPI app, /health, CORS, 404 envelope, lifespan
  routes.py          /api/* endpoints + zod-flatten validation errors
  pipeline.py        process_incoming_tx, agent_tick, asyncio scheduler
  storage.py         in-memory campaign/donors/donations/logs/dedupe
  zcash_watcher.py   zcashd JSON-RPC polling + simulated donations
  solana_minter.py   mock minter + real solders-based live minter
  models.py          pydantic mirrors of the TS types
  config.py          env loading, ISO timestamps, JS parseInt emulation
```
