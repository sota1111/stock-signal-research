# Worker Report (SOT-853)

> NOTE: Gemini CLI was non-responsive (run_gemini.sh exit 75; IneligibleTierError —
> free tier no longer supported). Codex CLI was also non-responsive (exit 75, usage-limit
> cooldown until ~2026-06-21). Per the Worker Non-Response Fallback Policy, Claude Code
> performed both the implementation and the verification directly.

## Summary
Expanded the dashboard seed data from a single year (2024) to a full rolling 10-year window
so the research charts (B1 paper_counts_by_year, B2 monthly trend, C1 papers-vs-stock)
display a real decade of analysis. The decade is anchored to the current year so it always
aligns with `signal_report`'s default rolling window (`now.year-9 .. now.year`).

## Changed Files
- `backend/app/seed.py`
  - Added decade-data helpers: `_month_str`, `_decade_monthly_counts`, `_decade_papers`, and
    constants `_DECADE_FROM_YEAR` / `_DECADE_TO_YEAR` / `_MONTHLY_MONTHS` (current-year anchored).
  - `_DASHBOARD_PAPERS` now = one paper per theme per year across the decade (70 papers).
  - `_DASHBOARD_MONTHLY_COUNTS` now = 120 months/theme (rising trend).
  - `seed_dashboard_data_firestore()` monthly loop: `month` derived via `_month_str(...)`
    instead of hardcoded `2024-{i+1:02d}`.
  - `run_seed()` (SQLite/local): `papers_data` via `_decade_papers(...)`, `pm_data` via
    `_decade_monthly_counts(...)`, month via `_month_str(...)`.
  - Moved `datetime`/`timezone` import to module top (lint E402).

## Commands Run
- `python -m pytest -q --ignore=tests/test_market_data.py` → 44 passed
  (test_market_data.py fails on collection only due to pre-existing missing `pandas`).
- `ruff check app/seed.py` → All checks passed.
- Functional check: feeding generated `_DASHBOARD_PAPERS` through `generate_signal_report('')`
  yields `paper_counts_by_year` with all 10 years populated (7/year); monthly span
  `<from>-01 .. <to>-12` (120 months).

## Acceptance Criteria
- [x] Dashboard research data spans ~10 years (2017–2026 at time of run), not just 2024
- [x] Both seed paths (SQLite run_seed + Firestore) updated consistently
- [x] Idempotency preserved; unrelated seed sections untouched
- [x] Tests pass (44), lint clean
- [x] signal_report charts populate across the full decade

## Risks
- yfinance stock charts (A1–A4) already pull up to 10y live; no change needed there.
- Prod adoption: the old seeder early-returned when themes already existed, so an
  already-seeded prod Firestore would NOT have picked up the new decade. Fixed by splitting
  the seeder: themes/companies/supply-chain/scores stay first-seed-guarded, while papers +
  monthly counts are now an idempotent top-up that always runs (repos upsert by
  paper_id / theme_id+keyword+year_month). So the next prod deploy backfills the full
  10-year dataset without overwriting other data. Updated `test_dashboard_seed_firestore.py`
  idempotency test to match this contract.
- B/C chart richness still depends on production having run the startup seeder; with the
  top-up it now self-heals on deploy.

## Next Action
READY_FOR_REVIEW
