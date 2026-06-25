# Worker Report — SOT-1238 特許調査と収納

## Fallback disclosure (audit)
- Non-responsive worker: Codex CLI
- Detected failure mode: usage-limit cooldown (`run_codex.sh` exit 75, until ~2026-06-28)
- Action: Per the Worker Non-Response Fallback Policy, Claude Code performed the task
  check, the targeted re-collection, and verification directly.

## Summary
SOT-1238 was actionable: the dataset covered all 100 themes' yearly counts but
`precision agriculture` had ZERO representative patents despite 88,825 matches.
Root cause: the script uses a single global dedup set keyed on `patent_id` (the DB
primary key). `precision agriculture`'s auto-generated query ORs generic terms
(`"machine learning"` etc.), so its top-80-by-date results were all already collected
under other AI themes and got deduped out, leaving the theme with 0 reps. Fixed by
fetching a deeper page (500) for that theme and keeping the first 80 records whose
`patent_id` was not already in the dataset.

## Changed Files
- `backend/data/collected-patents.json` — added 80 representative patents for
  `precision agriculture` (7923 → 8003); refreshed `generated_at`.

## Commands Run
- Targeted re-collection via `scripts/collect_dashboard_patents.py` module
  (`Ppubs.search`, `_normalize`) for the single theme `precision agriculture`.
- `ruff check scripts/collect_dashboard_patents.py app/seed.py` → All checks passed
- `pytest tests/test_patents.py -q` → 7 passed

## Findings
- THEME_QUERIES: 100; `theme_yearly_counts`: 100 (exact match).
- Representative patents: 8003, all `patent_id` unique.
- Themes with representative patents: 99/100.
- Only theme with 0 reps: `mixture of experts` — legitimate 0 (0 title/abstract
  matches; not a bug).

## Acceptance Criteria
- [x] All categories/titles (100 themes) researched and stored in collected-patents.json
- [x] `precision agriculture` > 0 representative patents (now 80)
- [x] No data corruption; patent_ids globally unique

## Risks
- `precision agriculture` representatives are dominated by generic ML patents because
  its auto-generated BRS query ORs broad terms. This is consistent with how its yearly
  counts are computed (same query) and matches the behavior of other sot994 themes.
  Improving per-theme query precision is a separate, larger scope.

## Next Action
READY_FOR_REVIEW
