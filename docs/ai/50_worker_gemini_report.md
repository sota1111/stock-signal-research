# Worker Report (Claude Code Fallback)

## Worker Non-Response Disclosure (audit)
- Non-responsive worker: **Gemini CLI**
- Detected failure mode: CLI crashed exit 1 → run_gemini.sh emitted non-response code **75**
  (`IneligibleTierError: UNSUPPORTED_CLIENT` — Gemini Code Assist free tier no longer supported).
- Action: Per the Worker Non-Response Fallback Policy, Claude Code performed this IMPLEMENT work directly.

## Summary
SOT-987: dashboard graph year-range floor changed from 2016 to 2000. Frontend-only change — the
dashboard now requests papers from year 2000 so the year-range selector (SOT-972) lists 2000+.
Backend already supported `from_year`/`to_year`; paper data already exists back to 2000.

## Changed Files
- `frontend/src/api/index.ts` — `fetchSignalReport(query, fromYear?)` now passes optional `from_year`.
- `frontend/src/pages/DashboardPage.tsx` — added `PAPER_HISTORY_FROM_YEAR = 2000`; signal-report query
  fetches from 2000 and includes the from-year in its queryKey.

## Commands Run
- (verification delegated to Codex — see docs/ai/60_worker_codex_report.md)

## Acceptance Criteria
- [x] Dashboard year-range selector lists years starting from 2000 (papers fetched from 2000)
- [x] 開始/終了 selectors and filtering unchanged; default shows full range
- [x] Market-cap/stock behavior unchanged (no data before 2016 is expected)
- [ ] lint + build pass (Codex to verify)

## Risks
- Stock/market-cap data only exists from 2016 (10-year snapshot); the 時価総額/クロス分析 graphs will
  have no data before 2016. This is expected per the data scope; papers graph now spans 2000+.

## Next Action
READY_FOR_REVIEW
