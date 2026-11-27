"""Zcash watcher — a direct port of backend/src/services/zcashWatcher.ts.

Live mode polls a zcashd-compatible JSON-RPC endpoint
(`z_listreceivedbyaddress` by default) for shielded receipts at the
campaign address. The node must have the viewing key imported; the
backend never receives a spending key.

Mock mode (no RPC URL, no campaign address, a `zs1demo…` address, or
ZCASH_MODE=mock) polls nothing and only injects simulated donations.
"""

from __future__ import annotations

import base64
import json
import secrets
import time
from typing import Any, Optional

import httpx

from .config import env, iso_from_epoch, js_parse_int, now_iso
from .models import IncomingShieldedTx
from .storage import storage


async def _zcash_rpc(method: str, params: list) -> Any:
    url = env("ZCASH_RPC_URL")
    if not url:
        raise RuntimeError("ZCASH_RPC_URL is not configured")

    headers = {"content-type": "application/json"}
    user = env("ZCASH_RPC_USER")
    password = env("ZCASH_RPC_PASSWORD")
    if user or password:
        raw = f"{user or ''}:{password or ''}".encode()
        headers["authorization"] = "Basic " + base64.b64encode(raw).decode()

    # trust_env=False: Node's fetch (TS version) ignores proxy env vars;
    # a local zcashd RPC must never be routed through a proxy.
    async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
        response = await client.post(
            url,
            headers=headers,
            json={"jsonrpc": "1.0", "id": "shieldgive", "method": method, "params": params},
        )

    if response.status_code < 200 or response.status_code >= 300:
        raise RuntimeError(f"Zcash RPC HTTP {response.status_code}")
    body = response.json()
    if body.get("error"):
        raise RuntimeError(body["error"].get("message") or "Zcash RPC error")
    return body.get("result")


def _decode_memo(record: dict) -> Optional[str]:
    if record.get("memoStr"):
        return record["memoStr"]
    if not record.get("memo"):
        return None
    try:
        raw = bytes.fromhex(record["memo"])
        return raw.decode("utf-8").rstrip("\x00")
    except Exception:
        return None


class ZcashWatcher:
    def __init__(self) -> None:
        address = env("CAMPAIGN_SHIELDED_ADDRESS")
        self._mock_mode = (
            env("ZCASH_MODE") == "mock"
            or not env("ZCASH_RPC_URL")
            or not address
            or address.startswith("zs1demo")
        )

    def is_mock_mode(self) -> bool:
        return self._mock_mode

    async def poll_incoming(self) -> list[IncomingShieldedTx]:
        if self._mock_mode:
            return []

        address = env("CAMPAIGN_SHIELDED_ADDRESS") or ""
        parsed_minconf = js_parse_int(env("ZCASH_MIN_CONFIRMATIONS", "1"))
        minconf = max(1, parsed_minconf if parsed_minconf is not None else 1)

        # z_listreceivedbyaddress is the supported legacy Sapling RPC for
        # wallet-tracked shielded addresses. The node must have the viewing
        # key imported; the backend never receives a spending key.
        method = env("ZCASH_RPC_METHOD") or "z_listreceivedbyaddress"
        raw_params = env("ZCASH_RPC_PARAMS")
        if raw_params:
            try:
                parsed = json.loads(raw_params)
                if not isinstance(parsed, list):
                    raise ValueError("ZCASH_RPC_PARAMS must be a JSON array")
                params: list = parsed
            except Exception as err:
                raise RuntimeError(f"Invalid ZCASH_RPC_PARAMS: {err}") from err
        elif method == "z_listreceivedbyaddress":
            params = [address, minconf]
        else:
            # For Zallet/zcashd variants, pass the exact RPC parameters
            # through ZCASH_RPC_PARAMS rather than guessing version-specific
            # argument order.
            params = []

        records = await _zcash_rpc(method, params)

        incoming: list[IncomingShieldedTx] = []
        for record in records or []:
            amount = float(record.get("amount") or 0)
            record_address = record.get("address")
            confirmations = float(record.get("confirmations") or 0)
            if not (
                record.get("txid")
                and amount > 0
                and confirmations >= minconf
                and (not record_address or record_address == address)
            ):
                continue
            amount_zec = amount if record.get("amount") is not None else float(record.get("amountZat") or 0) / 100_000_000
            blocktime = record.get("blocktime")
            incoming.append(
                IncomingShieldedTx(
                    txId=record["txid"],
                    amountZEC=amount_zec,
                    blockHeight=record.get("blockheight"),
                    memo=_decode_memo(record),
                    receivedAt=iso_from_epoch(blocktime) if blocktime else now_iso(),
                )
            )
        return incoming

    async def simulate_incoming_donation(
        self,
        amount_zec: float,
        tx_id: Optional[str] = None,
        memo: Optional[str] = None,
    ) -> IncomingShieldedTx:
        if not tx_id:
            # TS: `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            suffix = "".join(secrets.choice("0123456789abcdefghijklmnopqrstuvwxyz") for _ in range(6))
            tx_id = f"mock_tx_{int(time.time() * 1000)}_{suffix}"
        tx = IncomingShieldedTx(
            txId=tx_id,
            amountZEC=amount_zec,
            receivedAt=now_iso(),
            memo=memo or "ShieldGive donation",
        )
        storage.add_agent_log(
            "info",
            "Simulated shielded donation injected",
            {"txId": tx.txId, "amountZEC": tx.amountZEC},
        )
        return tx


zcash_watcher = ZcashWatcher()
