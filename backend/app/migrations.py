"""Lightweight, idempotent SQLite schema migrations (SOT-1120).

`Base.metadata.create_all()` only creates missing tables — it never ALTERs an existing
table to add new columns. When a persisted SQLite `app.db` predates a model change, the new
columns are silently absent and reads/writes fail. These helpers add missing columns with
`ALTER TABLE ... ADD COLUMN` and are safe to call on every startup (no-op once current).

Production uses Firestore (schemaless), so these migrations only act on SQLite engines.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# SOT-1120: 13F の保有内訳を independent columns で保持するための追加カラム。
# (column_name, SQLite column type)
_INVESTOR_COLUMNS: list[tuple[str, str]] = [
    ("cusip", "TEXT"),
    ("ticker", "TEXT"),
    ("shares", "INTEGER"),
    ("value_usd", "REAL"),
    ("quarter_delta", "INTEGER"),
]


def _existing_columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {r[1] for r in rows}


def ensure_investor_schema(engine: Engine) -> list[str]:
    """Idempotently add the SOT-1120 columns to `institutional_investors` if missing.

    Returns the list of columns added (empty when the schema is already current).
    No-op for non-SQLite engines and when the table does not exist yet (a fresh DB is
    handled by `create_all`). Safe to call on every startup.
    """
    if engine.url.get_backend_name() != "sqlite":
        return []

    added: list[str] = []
    table = "institutional_investors"
    with engine.begin() as conn:
        existing_tables = {
            r[0]
            for r in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            ).fetchall()
        }
        if table not in existing_tables:
            return []

        present = _existing_columns(conn, table)
        for name, col_type in _INVESTOR_COLUMNS:
            if name in present:
                continue
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {col_type}"))
                added.append(name)
            except Exception as exc:  # noqa: BLE001 - tolerate add-column races
                # Another worker/process may have added it concurrently; treat as present.
                logger.warning("ensure_investor_schema: could not add %s: %s", name, exc)

    if added:
        logger.info("ensure_investor_schema: added columns %s", added)
    return added
