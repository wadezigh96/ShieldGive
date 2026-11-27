"""Environment configuration helpers.

Mirrors the TypeScript backend, which loads `.env` via `dotenv/config`
before anything else runs. Importing this module loads `.env` first so
the service singletons (storage, watcher, minter) see the same values
the TS version would.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()


def env(name: str, default: str | None = None) -> str | None:
    """process.env[name] with a default (empty string counts as set, like TS)."""
    return os.environ.get(name, default)


def now_iso() -> str:
    """`new Date().toISOString()` — UTC, millisecond precision, `Z` suffix."""
    dt = datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def iso_from_epoch(seconds: float) -> str:
    """`new Date(epochSeconds * 1000).toISOString()`."""
    dt = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


_JS_INT_RE = re.compile(r"^\s*([+-]?\d+)")


def js_parse_int(raw: str | None) -> int | None:
    """Emulate JS `parseInt(raw, 10)`: leading integer or NaN (-> None)."""
    if raw is None:
        return None
    match = _JS_INT_RE.match(raw)
    if not match:
        return None
    try:
        return int(match.group(1), 10)
    except ValueError:
        return None


def get_port() -> int:
    return js_parse_int(env("PORT")) or 3001


def poll_interval_seconds() -> int:
    """Scheduler interval: `Math.max(10, parseInt(POLL_INTERVAL_SECONDS || "30", 10))`."""
    parsed = js_parse_int(env("POLL_INTERVAL_SECONDS", "30"))
    if parsed is None:
        parsed = 30
    return max(10, parsed)


def cron_expression(seconds: int) -> str:
    """The node-cron expression the TS scheduler builds for this interval."""
    if seconds < 60:
        return f"*/{seconds} * * * * *"
    return f"*/{seconds // 60} * * * *"


def effective_sleep_seconds(seconds: int) -> int:
    """How often ticks actually fire in TS (cron rounds >=60s down to whole minutes)."""
    if seconds < 60:
        return seconds
    return (seconds // 60) * 60
