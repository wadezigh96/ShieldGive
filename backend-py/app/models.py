"""Pydantic models mirroring backend/src/types/index.ts.

Serialization note: the TS backend relies on `JSON.stringify` dropping
`undefined` fields, so optional fields are `None` here and are excluded
at dump time via :func:`dump`.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel

LogLevel = Literal["info", "success", "warn", "error"]
DonationStatus = Literal["pending", "validated", "minted", "failed"]


class Campaign(BaseModel):
    id: str
    title: str
    description: str
    shieldedAddress: str
    createdAt: str
    totalRaisedZEC: float
    donationCount: int


class DonorRegistration(BaseModel):
    id: str
    solanaWallet: str
    registeredAt: str
    note: Optional[str] = None


class DetectedDonation(BaseModel):
    id: str
    txId: str  # Zcash txid (or mock id)
    amountZEC: float
    detectedAt: str
    status: DonationStatus
    solanaWallet: Optional[str] = None
    nftMintAddress: Optional[str] = None
    error: Optional[str] = None


class AgentLogEntry(BaseModel):
    id: str
    timestamp: str
    level: LogLevel
    message: str
    meta: Optional[dict[str, Any]] = None


class MintResult(BaseModel):
    success: bool
    mintAddress: Optional[str] = None
    signature: Optional[str] = None
    error: Optional[str] = None


class IncomingShieldedTx(BaseModel):
    """Mirror of the TS `IncomingShieldedTx` interface."""

    txId: str
    amountZEC: float
    blockHeight: Optional[int] = None
    memo: Optional[str] = None
    receivedAt: str


def _normalize_numbers(value: Any) -> Any:
    """Make integral floats serialize like JS numbers (`1` not `1.0`)."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: _normalize_numbers(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_numbers(v) for v in value]
    return value


def dump(model: BaseModel) -> dict[str, Any]:
    """JSON-ready dict: `None` fields dropped, like `JSON.stringify` + `undefined`."""
    return _normalize_numbers(model.model_dump(exclude_none=True))
