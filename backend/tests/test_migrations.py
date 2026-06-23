"""Idempotency tests for the SOT-1120 SQLite schema migration."""
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app.migrations import ensure_investor_schema


def _engine():
    # StaticPool keeps a single shared connection so the in-memory schema persists
    # across connect()/begin() calls within the test.
    return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

_NEW_COLUMNS = {"cusip", "ticker", "shares", "value_usd", "quarter_delta"}


def _columns(engine, table: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {r[1] for r in rows}


def _make_old_table(engine) -> None:
    """Create an institutional_investors table WITHOUT the SOT-1120 columns."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE institutional_investors (
                    id TEXT PRIMARY KEY,
                    investor_name TEXT NOT NULL,
                    company_id TEXT NOT NULL,
                    ownership_pct REAL,
                    change_pct REAL,
                    report_date TEXT,
                    report_type TEXT,
                    notes TEXT
                )
                """
            )
        )


def test_ensure_investor_schema_adds_missing_columns():
    engine = _engine()
    _make_old_table(engine)

    assert _NEW_COLUMNS.isdisjoint(_columns(engine, "institutional_investors"))

    added = ensure_investor_schema(engine)
    assert set(added) == _NEW_COLUMNS
    assert _NEW_COLUMNS.issubset(_columns(engine, "institutional_investors"))


def test_ensure_investor_schema_is_idempotent():
    engine = _engine()
    _make_old_table(engine)

    first = ensure_investor_schema(engine)
    assert set(first) == _NEW_COLUMNS

    # Second call must be a no-op and must not raise.
    second = ensure_investor_schema(engine)
    assert second == []
    assert _NEW_COLUMNS.issubset(_columns(engine, "institutional_investors"))


def test_ensure_investor_schema_noop_when_table_absent():
    engine = _engine()
    # No table created -> create_all handles fresh DBs; migration is a no-op.
    assert ensure_investor_schema(engine) == []
