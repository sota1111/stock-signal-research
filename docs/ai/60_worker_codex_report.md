# Worker Report

## Summary
Initial task check for SOT-1178「個別株メニュー追加」.

**Worker non-response (fallback disclosure):** `scripts/ai/run_codex.sh` exited with code 75
(CODEX_COOLDOWN_ACTIVE — usage-limit cooldown). Per the Worker Non-Response Fallback Policy,
Claude Code performed this task check directly.

SOT-1178 is actionable. It is a frontend-only change: add a new navigation menu item「個別株」
(individual stock) with its own page, and MOVE the financial fundamentals time-series section
(SOT-1121) out of `StockPage.tsx` into that new page.

## Findings
- Financial fundamentals section currently lives in `frontend/src/pages/StockPage.tsx`:
  - state/query: lines 51–65 (`fundCompanies`, `selectedFundTicker`, `fundamentals`)
  - JSX section: lines 159–198 (the `fundamentals.*` `<section>`)
  - imports: `FinancialFundamentalsChart` (line 11), `fetchFundamentalsCompanies` / `fetchFinancialFundamentals` (line 3)
- Navigation: `NAV_ITEMS` in `frontend/src/App.tsx` lines 41–53; routes in `<Routes>` ~lines 138–158.
  `/stock` route → `StockPage`. Need a new nav item + route for the individual-stock page.
- Component `FinancialFundamentalsChart` at `frontend/src/components/charts/FinancialFundamentalsChart.tsx` exists.
- API helpers `fetchFundamentalsCompanies` / `fetchFinancialFundamentals` exist in `frontend/src/api/index.ts` (lines 121, 124).
- i18n keys: `fundamentals.*` (ja: lines 489–500, en: 1109–1120); `nav.*` (ja: 7–29, en: 627–649) in `frontend/src/i18n/messages.ts`. Need a new `nav.individualStock` key (ja/en).
- Build/lint: `frontend/package.json` scripts = `dev, build, lint, preview` (no typecheck/test script — gate = lint + build).

## Changed Files
- none (investigation only)

## Commands Run
- grep over StockPage.tsx, App.tsx, messages.ts, api/index.ts; read StockPage.tsx fully.

## Acceptance Criteria
- [x] Confirmed fundamentals section location in StockPage.tsx
- [x] Confirmed NAV_ITEMS / Routes in App.tsx
- [x] Confirmed chart component + API helpers exist
- [x] Listed relevant i18n keys
- [x] Decomposition recommendation: NOT needed (single small frontend move)

## Risks
- New menu label/route name not specified by the issue. Chosen: label「個別株」(nav.individualStock),
  route `/individual-stock`, page `IndividualStockPage.tsx`. Reversible if human prefers otherwise.

## Next Action
READY_FOR_REVIEW
