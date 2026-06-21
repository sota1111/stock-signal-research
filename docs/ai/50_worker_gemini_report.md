# Worker Report — SOT-949 i18n residual sweep

## Worker Non-Response Fallback Disclosure
- Non-responsive worker: **Gemini CLI** (implementation worker).
- Detected failure mode: `run_gemini.sh` exited **75** — `IneligibleTierError: This client is no longer
  supported for Gemini Code Assist for individuals` (free-tier permanently unsupported). Treated as
  non-responsive per the Worker Non-Response Fallback Policy.
- Action: **Claude Code performed the implementation directly** as the narrowly-scoped fallback.
- Verification was delegated normally to **Codex CLI** (responsive); see `60_worker_codex_report.md`.

## Summary
Externalized all remaining hard-coded Japanese UI strings into the existing in-house i18n so the
JP/EN toggle (added in PR#64) now switches the whole app, addressing the human's reopen comments
listing residual Japanese across the 特許 / 投資家 / 前兆検知 / 一覧 / データ登録 / 一致度評価 /
初期リサーチ / 株価 pages and the chart/table components.

## Changed Files
- `frontend/src/i18n/messages.ts` — added ~200 JP/EN keys.
- `frontend/src/i18n/seedTranslations.ts` — NEW: English display map for research-seed narrative DATA (keyed by seed id; backend JSON unchanged).
- Pages: PatentsPage, InvestorsPage, SignalDetectionPage, ListPage, InputPage, EvaluationPage, ResearchSeedsPage, StockPage, PapersPage, DetailPage, dashboardShared.tsx, LoginPage.
- Components: ThemeCitationsList, ThemeCitationMatrix, and charts SignalBacktestTable, ReturnRankingBar, ValuationScatter, ChartCard/EmptyChart, SupplyChainGraphView, PaperCountsByYearBar, MonthlyPapersLine, SurgingKeywordsBar, CompanyScoreBar, PapersCountChart, NormalizedCompareLines, StockPriceLines, PapersVsPriceComposed, PapersMarketCapCrossChart, TopMarketCapChart, UnifiedThemeCrossChart.
- contexts/AuthContext.tsx — login failure fallback throws `INVALID_CREDENTIALS` sentinel, translated in LoginPage.

## Notes / approach
- List/Input tab state values stay Japanese (internal identifiers); display via label maps (MessageKey).
- Backtest signal labels (backend data) localized via display-time map; seed narratives via id-keyed EN map. No backend/API contract change.
- Renamed `.map(t => ...)` loop vars where they shadowed the i18n `t`.

## Commands Run
- Implementation by Claude Code fallback; build/lint verified by Codex (see codex report).

## Acceptance Criteria
- [x] JP/EN toggle switches the previously-untranslated UI strings
- [x] build (`tsc -b && vite build`) passes (Codex verified, exit 0)
- [x] lint (`eslint .`) passes (Codex verified, exit 0)

## Risks
- Server-provided error `detail` strings and free-form backend data outside the seed map remain in
  their original language (out of scope — backend data, not UI chrome).

## Next Action
READY_FOR_REVIEW
