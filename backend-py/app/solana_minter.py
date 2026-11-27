"""Solana minter — a port of backend/src/services/solanaMinter.ts.

Mock mode is byte-for-byte the TS behavior (deterministic fake mint
address / signature, 800 ms delay, same log lines).

Live mode is a REAL implementation: it builds and submits an actual
Metaplex NFT mint transaction with `solders` (create mint account ->
initialize mint -> create metadata -> create recipient ATA -> mint 1
token -> create master edition) against SOLANA_RPC_URL. It has NOT been
exercised against a funded live-cluster key in this environment, and
any failure — bad key, missing metadata URI, RPC error, on-chain
error — is logged and returned as `success: False`. It never fabricates
a mint address.
"""

from __future__ import annotations

import asyncio
import base64
import json
import struct
from typing import Optional

import httpx

from .config import env
from .models import MintResult
from .storage import storage

try:  # solders is only needed for the live path; mock mode must work without it.
    from solders.hash import Hash
    from solders.instruction import AccountMeta, Instruction
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solders.transaction import Transaction

    _SOLDERS_OK = True
except Exception:  # pragma: no cover
    _SOLDERS_OK = False

_SYSTEM_PROGRAM = "11111111111111111111111111111111"
_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
_ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
_METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
_RENT_SYSVAR = "SysvarRent111111111111111111111111111111111"
_DEFAULT_RPC = "https://api.mainnet-beta.solana.com"
_MINT_SPACE = 82

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58decode(text: str) -> bytes:
    num = 0
    for char in text.strip():
        num = num * 58 + _B58_ALPHABET.index(char)
    body = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    leading = len(text) - len(text.lstrip("1"))
    return b"\x00" * leading + body


def _load_secret_key_bytes() -> bytes:
    raw = env("SOLANA_PRIVATE_KEY")
    if not raw or raw == "mock":
        raise RuntimeError("SOLANA_PRIVATE_KEY is not configured")
    raw = raw.strip()
    if raw.startswith("["):
        return bytes(int(b) for b in json.loads(raw))
    return _b58decode(raw)


def _borsh_string(value: str) -> bytes:
    encoded = value.encode("utf-8")
    return struct.pack("<I", len(encoded)) + encoded


# ---------------------------------------------------------------------------
# Hand-rolled instruction builders (stable SPL / Metaplex layouts).
# solders is used for keys, messages and signing only.
# ---------------------------------------------------------------------------


def _ix_create_account(payer, new_account, lamports: int, space: int, owner) -> "Instruction":
    data = struct.pack("<IQQ", 0, lamports, space) + bytes(owner)
    return Instruction(
        Pubkey.from_string(_SYSTEM_PROGRAM),
        data,
        [
            AccountMeta(payer, True, True),
            AccountMeta(new_account, True, True),
        ],
    )


def _ix_initialize_mint(mint, mint_authority, freeze_authority) -> "Instruction":
    data = bytes([0, 0]) + bytes(mint_authority)  # discriminator 0, decimals 0
    if freeze_authority is not None:
        data += bytes([1]) + bytes(freeze_authority)
    else:
        data += bytes([0])
    return Instruction(
        Pubkey.from_string(_TOKEN_PROGRAM),
        data,
        [
            AccountMeta(mint, False, True),
            AccountMeta(Pubkey.from_string(_RENT_SYSVAR), False, False),
        ],
    )


def _ix_create_metadata_v3(metadata_pda, mint, mint_authority, payer, update_authority, name, symbol, uri) -> "Instruction":
    data_v2 = (
        _borsh_string(name)
        + _borsh_string(symbol)
        + _borsh_string(uri)
        + struct.pack("<H", 0)  # seller_fee_basis_points
        + bytes([0])  # creators: None
        + bytes([0])  # collection: None
        + bytes([0])  # uses: None
    )
    data = bytes([33]) + data_v2 + bytes([1]) + bytes([0])  # is_mutable=True, collection_details=None
    return Instruction(
        Pubkey.from_string(_METADATA_PROGRAM),
        data,
        [
            AccountMeta(metadata_pda, False, True),
            AccountMeta(mint, False, False),
            AccountMeta(mint_authority, True, False),
            AccountMeta(payer, True, True),
            AccountMeta(update_authority, False, False),
            AccountMeta(Pubkey.from_string(_SYSTEM_PROGRAM), False, False),
        ],
    )


def _ix_create_ata(payer, ata, owner, mint) -> "Instruction":
    return Instruction(
        Pubkey.from_string(_ATA_PROGRAM),
        b"",
        [
            AccountMeta(payer, True, True),
            AccountMeta(ata, False, True),
            AccountMeta(owner, False, False),
            AccountMeta(mint, False, False),
            AccountMeta(Pubkey.from_string(_SYSTEM_PROGRAM), False, False),
            AccountMeta(Pubkey.from_string(_TOKEN_PROGRAM), False, False),
        ],
    )


def _ix_mint_to(mint, destination, authority, amount: int) -> "Instruction":
    data = bytes([7]) + struct.pack("<Q", amount)
    return Instruction(
        Pubkey.from_string(_TOKEN_PROGRAM),
        data,
        [
            AccountMeta(mint, False, True),
            AccountMeta(destination, False, True),
            AccountMeta(authority, True, False),
        ],
    )


def _ix_create_master_edition_v3(edition_pda, mint, update_authority, mint_authority, payer, metadata_pda) -> "Instruction":
    data = bytes([17, 1]) + struct.pack("<Q", 0)  # max_supply = Some(0)
    return Instruction(
        Pubkey.from_string(_METADATA_PROGRAM),
        data,
        [
            AccountMeta(edition_pda, False, True),
            AccountMeta(mint, False, True),
            AccountMeta(update_authority, True, False),
            AccountMeta(mint_authority, True, False),
            AccountMeta(payer, True, True),
            AccountMeta(metadata_pda, False, True),
            AccountMeta(Pubkey.from_string(_TOKEN_PROGRAM), False, False),
            AccountMeta(Pubkey.from_string(_SYSTEM_PROGRAM), False, False),
            AccountMeta(Pubkey.from_string(_RENT_SYSVAR), False, False),
        ],
    )


async def _rpc(client: httpx.AsyncClient, url: str, method: str, params: list):
    response = await client.post(
        url,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
    )
    body = response.json()
    if body.get("error"):
        raise RuntimeError(f"Solana RPC {method} failed: {body['error'].get('message') or body['error']}")
    return body.get("result")


async def _live_mint(recipient_wallet: str, metadata_uri: str, name: str, symbol: str) -> tuple[str, str]:
    """Build, sign, submit and confirm a real Metaplex NFT mint.

    Returns (mint_address, signature). Raises on any failure — the
    caller converts that into a loud `success: False` result.
    """
    if not _SOLDERS_OK:
        raise RuntimeError("solders is not installed — live Solana minting unavailable")

    secret = _load_secret_key_bytes()
    if len(secret) == 64:
        payer = Keypair.from_bytes(secret)
    elif len(secret) == 32:
        payer = Keypair.from_seed(secret)
    else:
        raise RuntimeError("SOLANA_PRIVATE_KEY must decode to 32 or 64 bytes")

    rpc_url = env("SOLANA_RPC_URL") or _DEFAULT_RPC
    recipient = Pubkey.from_string(recipient_wallet)  # raises on invalid address
    mint_keypair = Keypair()
    mint_pubkey = mint_keypair.pubkey()
    payer_pubkey = payer.pubkey()

    metadata_program = Pubkey.from_string(_METADATA_PROGRAM)
    metadata_pda, _ = Pubkey.find_program_address(
        [b"metadata", bytes(metadata_program), bytes(mint_pubkey)], metadata_program
    )
    edition_pda, _ = Pubkey.find_program_address(
        [b"metadata", bytes(metadata_program), bytes(mint_pubkey), b"edition"], metadata_program
    )
    ata, _ = Pubkey.find_program_address(
        [bytes(recipient), bytes(Pubkey.from_string(_TOKEN_PROGRAM)), bytes(mint_pubkey)],
        Pubkey.from_string(_ATA_PROGRAM),
    )

    # trust_env=False: Node's fetch (TS version) ignores proxy env vars;
    # direct connection is the parity behavior (and local RPCs must not proxy).
    async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
        rent = await _rpc(client, rpc_url, "getMinimumBalanceForRentExemption", [_MINT_SPACE])
        blockhash_info = await _rpc(client, rpc_url, "getLatestBlockhash", [{"commitment": "finalized"}])
        blockhash = Hash.from_string(blockhash_info["value"]["blockhash"])

        instructions = [
            _ix_create_account(payer_pubkey, mint_pubkey, int(rent), _MINT_SPACE, Pubkey.from_string(_TOKEN_PROGRAM)),
            _ix_initialize_mint(mint_pubkey, payer_pubkey, payer_pubkey),
            _ix_create_metadata_v3(metadata_pda, mint_pubkey, payer_pubkey, payer_pubkey, payer_pubkey, name, symbol, metadata_uri),
            _ix_create_ata(payer_pubkey, ata, recipient, mint_pubkey),
            _ix_mint_to(mint_pubkey, ata, payer_pubkey, 1),
            _ix_create_master_edition_v3(edition_pda, mint_pubkey, payer_pubkey, payer_pubkey, payer_pubkey, metadata_pda),
        ]
        tx = Transaction.new_signed_with_payer(instructions, payer_pubkey, [payer, mint_keypair], blockhash)
        encoded = base64.b64encode(bytes(tx)).decode()
        signature = await _rpc(
            client,
            rpc_url,
            "sendTransaction",
            [encoded, {"encoding": "base64", "preflightCommitment": "confirmed"}],
        )

        # Confirm: poll signature status until finalized/confirmed or error.
        for _ in range(40):
            await asyncio.sleep(1.5)
            statuses = await _rpc(
                client,
                rpc_url,
                "getSignatureStatuses",
                [[signature], {"searchTransactionHistory": True}],
            )
            value = (statuses or {}).get("value") or []
            status = value[0] if value else None
            if status:
                if status.get("err"):
                    raise RuntimeError(f"Solana transaction failed on-chain: {status['err']}")
                if status.get("confirmationStatus") in ("confirmed", "finalized"):
                    return str(mint_pubkey), str(signature)
        raise RuntimeError("Timed out waiting for Solana transaction confirmation")


class SolanaMinter:
    def __init__(self) -> None:
        key = env("SOLANA_PRIVATE_KEY")
        self._mock_mode = env("SOLANA_MODE") == "mock" or not key or key == "mock"

    def is_mock_mode(self) -> bool:
        return self._mock_mode

    async def mint_donation_proof(
        self,
        recipient_wallet: str,
        amount_zec: float,
        donation_id: str,
        tx_id: str,
    ) -> MintResult:
        storage.add_agent_log(
            "info",
            "Starting NFT mint",
            {"recipientWallet": recipient_wallet, "amountZEC": amount_zec, "donationId": donation_id},
        )

        if self._mock_mode:
            mock_mint = f"mint_{donation_id.replace('-', '')[:16]}"
            mock_sig = f"sig_{tx_id[:16]}"
            await asyncio.sleep(0.8)
            storage.add_agent_log(
                "success",
                "NFT minted (mock mode)",
                {"mintAddress": mock_mint, "signature": mock_sig, "recipientWallet": recipient_wallet},
            )
            return MintResult(success=True, mintAddress=mock_mint, signature=mock_sig)

        try:
            uri = env("SOLANA_NFT_METADATA_URI")
            if not uri:
                raise RuntimeError("SOLANA_NFT_METADATA_URI is required for live minting")
            name = env("SOLANA_NFT_NAME") or "ShieldGive Donation Proof"
            symbol = env("SOLANA_NFT_SYMBOL") or "SGIVE"
            mint_address, signature = await _live_mint(recipient_wallet, uri, name, symbol)
            storage.add_agent_log(
                "success",
                "NFT minted on Solana",
                {
                    "mintAddress": mint_address,
                    "signature": signature,
                    "recipientWallet": recipient_wallet,
                    "amountZEC": amount_zec,
                    "txId": tx_id,
                },
            )
            return MintResult(success=True, mintAddress=mint_address, signature=signature)
        except Exception as err:
            message = str(err) or err.__class__.__name__
            storage.add_agent_log(
                "error",
                "Live Solana NFT mint failed",
                {"error": message, "recipientWallet": recipient_wallet, "txId": tx_id},
            )
            return MintResult(success=False, error=message)


solana_minter = SolanaMinter()
