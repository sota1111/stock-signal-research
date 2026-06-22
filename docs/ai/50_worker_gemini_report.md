# Worker Report (Claude Code Fallback)

## Fallback Disclosure (audit)
- Non-responsive worker: **Gemini CLI**.
- Detected failure mode: `scripts/ai/run_gemini.sh` exited with non-response code **75**
  (`GEMINI_DISABLED=1` set in `.env`; the CLI also returned `IneligibleTierError` /
  `UNSUPPORTED_CLIENT`, i.e. crash exit 1).
- Action taken: **Claude Code performed this implementation directly** under the Worker
  Non-Response Fallback Policy. Verification was delegated normally to Codex CLI (see
  `docs/ai/60_worker_codex_report.md`).

## Summary
SOT-1049「平均グラフ追加」implemented. Added a Dashboard chart showing, per category
group (Theme.category), the average papers-per-theme by year — so users can tell whether
paper volume is broadly growing regardless of how many themes a category has.

## Changed Files
- `backend/app/services/signal_report.py` — pure fn `aggregate_category_paper_averages`
  (category averages = papers-in-category-year ÷ themes-in-category; 0-paper themes count
  in the denominator; unknown theme_id / unparseable year excluded).
- `backend/app/schemas.py` — `CategoryPaperAverageItem`, `CategoryPaperAveragesResponse`.
- `backend/app/routers/dashboard.py` — `GET /dashboard/category-paper-averages?from_year=&to_year=`.
- `frontend/src/types/index.ts` — `CategoryPaperAverageItem`, `CategoryPaperAverages`.
- `frontend/src/api/index.ts` — `fetchCategoryPaperAverages(fromYear?, toYear?)`.
- `frontend/src/components/charts/CategoryAvgPapersChart.tsx` — new multi-line chart (1 line/category).
- `frontend/src/pages/DashboardPage.tsx` — new card `categoryAvg` (toggle + query + ChartCard),
  placed just after the 論文件数 chart; filters by the dashboard year range.
- `frontend/src/i18n/messages.ts` — `chart.categoryAvg.title/subtitle/loading/empty` (ja + en).

## Commands Run
- (implementation by Claude Code fallback; verification commands in Codex report)

## Acceptance Criteria
- [x] カテゴリグループ別の平均論文数グラフをダッシュボードに追加した。
- [x] グラフ位置を判断して追加（既存「論文件数」カードの直後 / 表示ON/OFFトグル対応）。
- [x] テーマ数の多寡に依らない比較（平均 = 論文数 ÷ テーマ数、0件テーマも分母）。

## Risks
- Category labels come from actual `Theme.category` values; the SOT-994 universe currently
  has 12 category labels (not the documented 10 domains). The chart groups by real category,
  which is the correct deterministic behavior.

## Next Action
READY_FOR_REVIEW
