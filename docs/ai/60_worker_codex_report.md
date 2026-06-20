# Worker Report — Task Check (SOT-944)

> NOTE (Fallback audit): Codex CLI was non-responsive (`scripts/ai/run_codex.sh` exit 75,
> usage-limit cooldown until epoch 1782000900). Per the Worker Non-Response Fallback Policy,
> Claude Code performed this task check directly. Retry would not help (cooldown ~5.6h out).

## Summary
- **Req 1 — 30 themes: SATISFIED.** `backend/app/seed.py` seeds `_DASHBOARD_THEMES` (30 themes; comment says "Firestore と同じ30テーマ"). `backend/data/collected-papers.json` contains exactly 30 distinct themes.
- **Req 2 — 10y papers + citations per theme: SATISFIED.** `collected-papers.json` has 710 real arXiv papers, year range 2001–2026, ~25 papers/theme, `citation_count` populated on 580/710 (SOT-909). Each theme has multi-year real papers with citations.
- **Req 3 — dashboard matrix (行列形式) of per-theme citation totals: MISSING.** Today the dashboard shows per-theme citation totals only as a **card grid / flat list** (`frontend/src/components/ThemeCitationsList.tsx` rendered in `DashboardPage.tsx`; backend `aggregate_theme_citations` in `backend/app/services/signal_report.py` + `/dashboard/theme-citations`). There is NO theme × year matrix/grid of citation sums. This is the new work for SOT-944.

## Changed Files
- none (read-only check)

## Commands Run
- `python3` shape inspection of `initial-research-seeds.json` (11 seeds) and `collected-papers.json` (710 papers, 30 themes, 2001–2026, 580 cited)
- `grep` over `backend/app/seed.py`, `backend/app/routers/dashboard.py`, `frontend/src` for matrix/theme-citations
- read `ThemeCitationsList.tsx`, `aggregate_theme_citations`

## Acceptance Criteria
- [x] 30 themes present
- [x] each theme has ~10y papers with citation_count
- [ ] dashboard shows per-theme citation totals in matrix form  ← MISSING (only card list today)

## Risks
- "行列形式" (matrix) is underspecified. Most plausible reading given "過去10年分の論文と引用数": rows = themes (30), columns = years (last ~10y), cells = sum of `citation_count` for that theme×year. This reuses existing data and directly shows per-theme citation totals across years. Implement as a heatmap-style table with a per-theme total column and per-year column totals.

## Next Action
NEEDS_DEBUG → reclassified by Claude as IMPLEMENT (add theme×year citation matrix to dashboard).
