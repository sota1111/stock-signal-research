# Worker Report

## Summary
SOT-991: ダッシュボードにあった「状態表示」（状態バナー + 重要指標KPIカード）を独立した
専用ページ `/status` へ移行した。

**Worker Non-Response Fallback Disclosure**
- Non-responsive worker: Gemini CLI
- Detected failure mode: `run_gemini.sh` exit 75 (WORKER_NONRESPONSE) — IneligibleTierError
  (`This client is no longer supported for Gemini Code Assist for individuals`, free-tier unsupported).
  This is the known-permanent Gemini CLI condition.
- Action: Per the Worker Non-Response Fallback Policy, Claude Code performed this IMPLEMENT work directly.

## Changed Files
- `frontend/src/pages/StatusPage.tsx` — 新規。状態バナー + KPIカードグリッドを描画する専用ページ。
  query hooks（useDashboardQuery / useTickerStocks / fetchThemeCitations / fetchSignalReport）と
  ステータス判定・KPI 算出ロジックは DashboardPage から挙動同一で移設。
- `frontend/src/pages/DashboardPage.tsx` — 状態バナー JSX と KPI グリッド JSX、および専用化された
  派生ロジック（statusKey/statusConfig/status/kpis, trendingCount/companyCount/topKeyword,
  totalCitations, theme-citations query, stock success-rate 計算）を削除。グラフ・セレクタ・
  refetch・lastAnalyzed ヘッダは従来どおり維持。未使用となった `ReactNode`・`fetchThemeCitations`
  import を除去。useTickerStocks の分割代入を `{ stockItems }` のみに縮小。
- `frontend/src/App.tsx` — StatusPage を import し、`/status` ルートと nav `状態`/`Status` を追加。
- `frontend/src/i18n/messages.ts` — ja/en に `nav.status` / `status.page.title` / `status.page.subtitle` を追加。

## Commands Run
- 検証は Codex（run_codex.sh）に委譲（lint / build）。本ファイルは実装記録のみ。

## Acceptance Criteria
- [x] 状態バナー + 5KPIカードがダッシュボードから消え、`/status` に表示される
- [x] `/status` がナビに「状態」/「Status」で追加され遷移できる
- [x] 状態判定(ok/warning/empty)・KPI値・refetch動作を移行後も同一ロジックで維持
- [x] ダッシュボードのグラフ・セレクタは従来どおり
- [x] ja/en 切替対応（新キー両言語に追加）
- [ ] lint + build pass（Codex 検証で確認）

## Risks
- DashboardPage と StatusPage が同じ query key（dashboard / signal-report / theme-citations）を共有するため、
  両ページ間で React Query キャッシュが再利用される（重複フェッチなし、意図どおり）。
- 値は実データ由来（30/5/HBM/741,420/100% 等）でデータにより変動する。

## Next Action
READY_FOR_REVIEW
