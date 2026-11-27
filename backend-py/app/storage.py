"""In-memory store — a direct port of backend/src/services/storage.ts.

Simple in-memory store for the MVP demo. Replace with a real database
(Postgres / SQLite) for production. Semantics (insertion order for
donors, newest-first logs capped at 200, processed-tx dedupe set,
8-decimal rounding of raised totals) match the TS version exactly.
"""

from __future__ import annotations

import uuid
from typing import Optional

from .config import env, now_iso
from .models import (
    AgentLogEntry,
    Campaign,
    DetectedDonation,
    DonorRegistration,
    LogLevel,
)

_DEMO_ADDRESS = "zs1demoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"


class Storage:
    def __init__(self) -> None:
        self._campaign = Campaign(
            id="camp_demo_001",
            title="ShieldGive — Private Contribution Proofs",
            description=(
                "Make a private Zcash contribution and associate it with a "
                "verifiable Solana proof wallet. ShieldGive separates donor "
                "identity from the public proof layer and keeps the "
                "contribution workflow privacy-focused."
            ),
            shieldedAddress=env("CAMPAIGN_SHIELDED_ADDRESS") or _DEMO_ADDRESS,
            createdAt=now_iso(),
            totalRaisedZEC=0,
            donationCount=0,
        )
        self._donors: dict[str, DonorRegistration] = {}
        self._donations: dict[str, DetectedDonation] = {}
        self._agent_logs: list[AgentLogEntry] = []
        self._processed_tx_ids: set[str] = set()

    # -- campaign ---------------------------------------------------------

    def get_campaign(self) -> Campaign:
        return self._campaign.model_copy()

    def record_raised(self, amount_zec: float) -> None:
        # TS: Math.round((total + amount) * 1e8) / 1e8
        self._campaign.totalRaisedZEC = round((self._campaign.totalRaisedZEC + amount_zec) * 1e8) / 1e8
        self._campaign.donationCount += 1

    # -- donors -----------------------------------------------------------

    def register_donor(self, solana_wallet: str, note: Optional[str] = None) -> DonorRegistration:
        normalized = solana_wallet.strip()
        if not normalized:
            raise ValueError("Solana wallet address is required")

        # Simple uniqueness by wallet
        for existing in self._donors.values():
            if existing.solanaWallet == normalized:
                return existing

        registration = DonorRegistration(
            id=str(uuid.uuid4()),
            solanaWallet=normalized,
            registeredAt=now_iso(),
            note=note,
        )
        self._donors[registration.id] = registration
        return registration

    def get_donors(self) -> list[DonorRegistration]:
        return list(self._donors.values())

    def find_donor_by_wallet(self, wallet: str) -> Optional[DonorRegistration]:
        normalized = wallet.strip()
        for donor in self._donors.values():
            if donor.solanaWallet == normalized:
                return donor
        return None

    def get_latest_donor(self) -> Optional[DonorRegistration]:
        """Returns the most recent registered donor (demo heuristic)."""
        all_donors = self.get_donors()
        if not all_donors:
            return None
        return sorted(all_donors, key=lambda d: d.registeredAt, reverse=True)[0]

    # -- processed tx dedupe ----------------------------------------------

    def is_tx_processed(self, tx_id: str) -> bool:
        return tx_id in self._processed_tx_ids

    def mark_tx_processed(self, tx_id: str) -> None:
        self._processed_tx_ids.add(tx_id)

    # -- donations ----------------------------------------------------------

    def add_donation(self, donation: DetectedDonation) -> DetectedDonation:
        """TS takes the donation without `id` and assigns a uuid; here the
        caller passes a placeholder id which is replaced."""
        full = donation.model_copy(update={"id": str(uuid.uuid4())})
        self._donations[full.id] = full
        return full

    def update_donation(self, donation_id: str, patch: dict) -> Optional[DetectedDonation]:
        existing = self._donations.get(donation_id)
        if existing is None:
            return None
        updated = existing.model_copy(update=patch)
        self._donations[donation_id] = updated
        return updated

    def get_donations(self) -> list[DetectedDonation]:
        return sorted(
            self._donations.values(),
            key=lambda d: d.detectedAt,
            reverse=True,
        )

    def find_donation_by_tx_id(self, tx_id: str) -> Optional[DetectedDonation]:
        """Find the (single) donation record for a tx, if one already exists."""
        for donation in self._donations.values():
            if donation.txId == tx_id:
                return donation
        return None

    # -- agent logs ---------------------------------------------------------

    def add_agent_log(
        self,
        level: LogLevel,
        message: str,
        meta: Optional[dict] = None,
    ) -> AgentLogEntry:
        entry = AgentLogEntry(
            id=str(uuid.uuid4()),
            timestamp=now_iso(),
            level=level,
            message=message,
            meta=meta,
        )
        self._agent_logs.insert(0, entry)
        # Keep last 200 entries for demo
        if len(self._agent_logs) > 200:
            self._agent_logs = self._agent_logs[:200]
        return entry

    def get_agent_logs(self, limit: int | None = 50) -> list[AgentLogEntry]:
        if limit is None:
            # JS slice(0, NaN) -> []
            return []
        return self._agent_logs[:limit]


storage = Storage()
