"""Agent pipeline + scheduler — a port of backend/src/agent/pipeline.ts
and backend/src/agent/scheduler.ts.

Core agent pipeline — deterministic, no LLM reasoning.

Fixed sequence:
  1. Poll (or receive) new shielded transactions
  2. Skip transactions that already completed successfully
  3. Correlate the payment to a registered donor using the private memo code
  4. Validate basic constraints
  5. Mint NFT proof
  6. Update campaign totals + agent log

A transaction is marked processed only after successful minting. This
keeps failed mint attempts retryable across polling cycles while the
MVP uses its in-memory store.

The TS scheduler uses node-cron; here an asyncio task started at app
startup runs one tick immediately and then one tick per interval.
"""

from __future__ import annotations

import asyncio
import re
from typing import Optional

from .config import (
    cron_expression,
    effective_sleep_seconds,
    now_iso,
    poll_interval_seconds,
)
from .models import DetectedDonation, IncomingShieldedTx
from .solana_minter import solana_minter
from .storage import storage
from .zcash_watcher import zcash_watcher

_DONOR_MEMO_RE = re.compile(r"(?:shieldgive[:\s]+)?donor[=:]([a-zA-Z0-9_-]+)", re.IGNORECASE)


def donor_id_from_memo(memo: Optional[str]) -> Optional[str]:
    if not memo:
        return None
    match = _DONOR_MEMO_RE.search(memo)
    return match.group(1) if match else None


async def process_incoming_tx(tx: IncomingShieldedTx) -> None:
    if storage.is_tx_processed(tx.txId):
        storage.add_agent_log("info", "Skipping successfully processed tx", {"txId": tx.txId})
        return

    storage.add_agent_log(
        "info",
        "New shielded transaction detected",
        {"txId": tx.txId, "amountZEC": tx.amountZEC},
    )

    donor_id = donor_id_from_memo(tx.memo)
    donor = None
    if donor_id:
        for candidate in storage.get_donors():
            if candidate.id == donor_id:
                donor = candidate
                break

    # Dedupe: a failed tx is retried on every tick, but it must update the
    # existing record instead of appending a new one (previously the list
    # grew by one failed record per tick for the same txid).
    existing = storage.find_donation_by_tx_id(tx.txId)
    if existing is not None:
        donation = storage.update_donation(
            existing.id,
            {
                "detectedAt": tx.receivedAt or now_iso(),
                "status": "pending",
                "solanaWallet": donor.solanaWallet if donor else None,
                "error": None,
            },
        ) or existing
    else:
        donation = storage.add_donation(
            DetectedDonation(
                id="",  # replaced by storage.add_donation
                txId=tx.txId,
                amountZEC=tx.amountZEC,
                detectedAt=tx.receivedAt or now_iso(),
                status="pending",
                solanaWallet=donor.solanaWallet if donor else None,
            )
        )

    if donor is None:
        storage.update_donation(
            donation.id,
            {
                "status": "failed",
                "error": (
                    "Donation memo did not match a registered donor"
                    if donor_id
                    else "Donation memo missing ShieldGive donor code"
                ),
            },
        )
        storage.add_agent_log(
            "warn",
            "Payment detected but donor correlation failed — NFT not minted",
            {"txId": tx.txId, "donationId": donation.id, "memo": tx.memo},
        )
        return

    if tx.amountZEC <= 0:
        storage.update_donation(donation.id, {"status": "failed", "error": "Invalid amount"})
        storage.add_agent_log(
            "error",
            "Invalid donation amount",
            {"txId": tx.txId, "amountZEC": tx.amountZEC},
        )
        return

    storage.update_donation(donation.id, {"status": "validated"})
    storage.add_agent_log(
        "success",
        "Payment validated",
        {"donationId": donation.id, "solanaWallet": donor.solanaWallet, "donorId": donor.id},
    )

    try:
        mint_result = await solana_minter.mint_donation_proof(
            recipient_wallet=donor.solanaWallet,
            amount_zec=tx.amountZEC,
            donation_id=donation.id,
            tx_id=tx.txId,
        )

        if mint_result.success:
            storage.update_donation(
                donation.id,
                {"status": "minted", "nftMintAddress": mint_result.mintAddress},
            )
            storage.record_raised(tx.amountZEC)
            storage.mark_tx_processed(tx.txId)
            storage.add_agent_log(
                "success",
                "Donation proof NFT minted & campaign updated",
                {
                    "donationId": donation.id,
                    "mintAddress": mint_result.mintAddress,
                    "totalRaisedZEC": storage.get_campaign().totalRaisedZEC,
                },
            )
            return

        storage.update_donation(
            donation.id,
            {"status": "failed", "error": mint_result.error or "Mint failed — will retry"},
        )
        storage.add_agent_log(
            "warn",
            "NFT mint failed — transaction remains retryable",
            {"txId": tx.txId, "donationId": donation.id, "error": mint_result.error},
        )
    except Exception as err:
        message = str(err) or err.__class__.__name__
        storage.update_donation(
            donation.id,
            {"status": "failed", "error": f"{message} — will retry"},
        )
        storage.add_agent_log(
            "warn",
            "NFT mint threw an error — transaction remains retryable",
            {"txId": tx.txId, "donationId": donation.id, "error": message},
        )


_tick_running = False


async def agent_tick() -> None:
    """Single agent tick — called by the scheduler."""
    global _tick_running
    if _tick_running:
        storage.add_agent_log("info", "Agent tick skipped — previous tick still running")
        return

    _tick_running = True
    storage.add_agent_log("info", "Agent tick — polling for new shielded transactions")

    try:
        incoming = await zcash_watcher.poll_incoming()

        if len(incoming) == 0:
            storage.add_agent_log("info", "No new transactions found this cycle")
            return

        for tx in incoming:
            await process_incoming_tx(tx)
    except Exception as err:
        message = str(err) or err.__class__.__name__
        storage.add_agent_log("error", "Agent tick failed", {"error": message})
    finally:
        _tick_running = False


_agent_task: Optional[asyncio.Task] = None


async def _agent_loop() -> None:
    seconds = poll_interval_seconds()
    storage.add_agent_log(
        "info",
        f"Agent started — polling every {seconds}s",
        {"expression": cron_expression(seconds)},
    )

    # Run one tick immediately so the dashboard is not empty
    asyncio.create_task(agent_tick())

    sleep_seconds = effective_sleep_seconds(seconds)
    while True:
        await asyncio.sleep(sleep_seconds)
        await agent_tick()


def start_agent() -> None:
    """Start the background monitoring agent (mirrors startAgent())."""
    global _agent_task
    if _agent_task is not None and not _agent_task.done():
        _agent_task.cancel()
    _agent_task = asyncio.create_task(_agent_loop())


def stop_agent() -> None:
    """Stop the background monitoring agent (mirrors stopAgent())."""
    global _agent_task
    if _agent_task is not None:
        _agent_task.cancel()
        _agent_task = None
        storage.add_agent_log("info", "Agent stopped")
