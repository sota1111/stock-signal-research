# Worker Report

## Summary
Initial task check for SOT-1179「読み込み中」.

**Worker non-response (fallback disclosure):** `scripts/ai/run_codex.sh` exited with code 75
(CODEX_COOLDOWN_ACTIVE — usage-limit cooldown until epoch 1782609660). Per the Worker
Non-Response Fallback Policy, Claude Code performed this task check directly.

SOT-1179 is actionable. It is a frontend-only UX bug: while data is being fetched, several
pages render charts/tables that display a "no data" / empty state instead of a loading
indicator. The patents page is the explicit example named in the issue.

Root cause pattern: a chart/table is rendered with `data ?? []` (empty during fetch) while the
owning `useQuery` either does not expose `isLoading`, or `isLoading` is not used to gate the
render. The empty array then trips the component's empty-state branch ("データがありません").

## Changed Files
- none (task check only)

## Findings
- **Patents page** `frontend/src/pages/PatentsPage.tsx`:
  - `yearly` query (line 30) and `topAssignees` query (line 35) do NOT destructure `isLoading`.
  - 年次トレンド `<PatentCountsByYearBar data={yearlyChart}>` (line 148) → `PatentCountsByYearBar`
    renders `<EmptyChart>` when data empty (`PatentCountsByYearBar.tsx:8`) → shows "no data" during load.
  - 主要出願人 (line 164) `topAssignees.length === 0 ? <EmptyChart>` → shows empty during load.
  - 特許×論文 overlay (line 156) likewise empty during load.
  - Only the patent *list* (line 191) guards `isLoading` correctly.
- **IndividualStockPage** `frontend/src/pages/IndividualStockPage.tsx:43-44`:
  - `fundCompanies` query (line 15) does not expose `isLoading`; outer `fundTickers.length === 0`
    shows `t('fundamentals.noData')` while the companies query is still loading. (The inner chart is
    correctly gated by `isFundLoading`.)
- **ListPage** `frontend/src/pages/ListPage.tsx`: per-tab queries (lines 38-42) do not expose
  `isLoading`; tables render an empty `<tbody>` during load (no loading indicator).
- Pages that already handle loading correctly (reference pattern):
  DashboardPage / StockPage / InvestmentCandidatesPage / InvestorsPage / StatusPage
  (`if (isLoading) return <DashboardLoading />`), PapersPage, SupplyChainPage / DetailPage /
  ResearchHubPage (`if (isLoading) return <PageLoading />`), SignalDetectionPage, ResearchSeedsPage
  (`isLoading && <loading>`; empty guarded by `seeds &&`).
- Reusable components for the fix: `frontend/src/components/AsyncState.tsx` →
  `PageLoading`, `ChartSkeleton`, `PageError`, `PageEmpty`; `ChartCard` + `EmptyChart`.

## Commands Run
- grep over `frontend/src/pages/` for `EmptyChart` / `isLoading` / loading guards; read
  PatentsPage.tsx, PapersPage.tsx, ListPage.tsx, IndividualStockPage.tsx, ResearchSeedsPage.tsx,
  AsyncState.tsx, ChartCard.tsx, PatentCountsByYearBar.tsx.

## Acceptance Criteria
- [x] Patents page: identified charts that show empty/no-data during fetch (yearly trend, top
  assignees, patents×papers overlay) — fix = gate on `isLoading` with a loading state.
- [x] Other affected pages identified: IndividualStockPage (outer noData during companies load),
  ListPage (empty tables during load).

## Risks
- Frontend-only, low risk. No backend changes. Gate = lint + build (repo has no typecheck/test script).
- Decomposition: NOT needed — one cohesive UX fix across a few frontend pages, one PR.

## Next Action
READY_FOR_REVIEW
