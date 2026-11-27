"""HTTP routes — a port of backend/src/routes/api.ts.

Same paths, same JSON envelope (`{success, data}` /
`{success: false, error}`), same status codes (201 for register and
simulate), and validation errors shaped like zod's `err.flatten()`:
`{formErrors: [...], fieldErrors: {field: [messages]}}` with
zod-compatible message strings for the constraints used here.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from .config import env, js_parse_int
from .models import dump
from .pipeline import process_incoming_tx
from .storage import storage
from .zcash_watcher import zcash_watcher

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Validation (zod equivalents)
# ---------------------------------------------------------------------------


class RegisterBody(BaseModel):
    solanaWallet: str = Field(min_length=32, max_length=64)
    note: Optional[str] = Field(default=None, max_length=200)


class SimulateBody(BaseModel):
    amountZEC: float = Field(gt=0, le=1000)
    memo: Optional[str] = Field(default=None, max_length=200)


def _zod_message(err: dict) -> str:
    """Translate a pydantic error into zod's message wording."""
    etype = err.get("type", "")
    ctx = err.get("ctx") or {}
    if etype == "missing":
        return "Required"
    if etype == "string_too_short":
        return f"String must contain at least {ctx.get('min_length')} character(s)"
    if etype == "string_too_long":
        return f"String must contain at most {ctx.get('max_length')} character(s)"
    if etype == "string_type":
        return "Expected string, received " + _js_type_name(err.get("input"))
    if etype in ("float_type", "int_type", "decimal_type"):
        return "Expected number, received " + _js_type_name(err.get("input"))
    if etype == "greater_than":
        return f"Number must be greater than {ctx.get('gt')}"
    if etype == "less_than_equal":
        return f"Number must be less than or equal to {ctx.get('le')}"
    if etype in ("float_parsing", "int_parsing"):
        return "Expected number, received nan"
    return str(err.get("msg", "Invalid input"))


def _js_type_name(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "unknown"


def _flatten(exc: ValidationError) -> dict:
    """zod's `err.flatten()` shape."""
    form_errors: list[str] = []
    field_errors: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = err.get("loc") or ()
        message = _zod_message(err)
        if loc:
            field_errors.setdefault(str(loc[0]), []).append(message)
        else:
            form_errors.append(message)
    return {"formErrors": form_errors, "fieldErrors": field_errors}


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


def _error(status: int, error) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": False, "error": error})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/campaign")
async def get_campaign():
    return {"success": True, "data": dump(storage.get_campaign())}


@router.post("/register")
async def register(request: Request):
    try:
        body = RegisterBody.model_validate(await _json_body(request))
        registration = storage.register_donor(body.solanaWallet, body.note)

        storage.add_agent_log(
            "info",
            "Donor wallet registered",
            {"solanaWallet": registration.solanaWallet, "donorId": registration.id},
        )

        return JSONResponse(status_code=201, content={"success": True, "data": dump(registration)})
    except ValidationError as err:
        return _error(400, _flatten(err))
    except Exception as err:
        return _error(400, str(err) or "Registration failed")


@router.get("/donors")
async def get_donors():
    return {"success": True, "data": [dump(d) for d in storage.get_donors()]}


@router.get("/donations")
async def get_donations():
    return {"success": True, "data": [dump(d) for d in storage.get_donations()]}


@router.get("/agent/logs")
async def get_agent_logs(request: Request):
    raw = request.query_params.get("limit") or "40"
    parsed = js_parse_int(raw)
    limit = min(100, parsed) if parsed is not None else None
    return {"success": True, "data": [dump(e) for e in storage.get_agent_logs(limit)]}


@router.get("/agent/status")
async def get_agent_status():
    key = env("SOLANA_PRIVATE_KEY")
    parsed_interval = js_parse_int(env("POLL_INTERVAL_SECONDS", "30"))
    return {
        "success": True,
        "data": {
            "mockZcash": zcash_watcher.is_mock_mode(),
            # Mirrors the TS route exactly: SOLANA_MODE is NOT consulted here.
            "mockSolana": key == "mock" or not key,
            "pollIntervalSeconds": parsed_interval,
            "totalDonations": len(storage.get_donations()),
            "registeredDonors": len(storage.get_donors()),
        },
    }


@router.post("/agent/simulate")
async def simulate(request: Request):
    try:
        body = SimulateBody.model_validate(await _json_body(request))
        tx = await zcash_watcher.simulate_incoming_donation(body.amountZEC, memo=body.memo)

        await process_incoming_tx(tx)

        return JSONResponse(
            status_code=201,
            content={
                "success": True,
                "data": {
                    "txId": tx.txId,
                    "amountZEC": tx.amountZEC,
                    "message": "Simulated donation processed through the agent pipeline",
                },
            },
        )
    except ValidationError as err:
        return _error(400, _flatten(err))
    except Exception as err:
        return _error(500, str(err) or "Simulation failed")
