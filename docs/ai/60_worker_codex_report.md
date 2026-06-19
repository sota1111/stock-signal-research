# Worker Report — Task Check (SOT-853)

> NOTE: Codex CLI was non-responsive (run_codex.sh exit 75, usage-limit cooldown until
> ~2026-06-21). Per the Worker Non-Response Fallback Policy, Claude Code performed this
> task check directly.

## Summary
SOT-853 is actionable. It was Done (PR #35 added 10 dashboard charts) and the human reopened
it (Todo → In Progress) with: 「10年分のデータを調査して追加してください。」

Confirmed data gap: the dashboard 10-year charts are backed by seed data, but the seed data
spans only 2024:
- `backend/app/seed.py` `_DASHBOARD_PAPERS` = 5 papers, all `2024-xx`.
- `_DASHBOARD_MONTHLY_COUNTS` = 12 months, seeded as `2024-{i+1:02d}` (single year only).
- `run_seed()` (SQLite) papers/monthly section likewise only 2024.
- `signal_report.generate_signal_report` derives `paper_counts_by_year` over the last 10
  years (default `to_year=now.year`, `from_year=to_year-9`) from each paper's `published_at`
  year. With only 2024 papers, B1 shows a single non-zero bar; B2 monthly trend and C1
  papers-vs-stock effectively cover one year.

## Changed Files
- none (task check)

## Commands Run
- `cd backend && python -m pytest -q --ignore=tests/test_market_data.py` → 44 passed
  (test_market_data.py fails on collection only due to a pre-existing missing `pandas`
  in the venv — unrelated to this issue).
- `python -m pytest -q tests/test_dashboard_seed_firestore.py tests/test_signal_report.py` → 14 passed.

## Acceptance Criteria
- [x] Issue is actionable
- [x] Data gap confirmed (papers/monthly span only 2024, not 10 years)
- [x] Baseline tests recorded (44 passed)

## Risks
- `test_dashboard_seed_firestore.py` asserts saved counts dynamically from
  `_DASHBOARD_PAPERS` / `_DASHBOARD_MONTHLY_COUNTS`, so expanding the lists is safe.
- The Firestore monthly-seed loop hardcodes `2024-{i+1:02d}`; expanding counts beyond 12
  requires changing it to emit real `YYYY-MM` across multiple years.
- `signal_report` tests use their own fixtures (independent of seed data) — unaffected.

## Next Action
READY_FOR_REVIEW
