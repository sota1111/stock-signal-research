# Worker Report

## Summary
SOT-1178「個別株メニュー追加」を実装。新メニュー「個別株」(/individual-stock) を追加し、財務
ファンダメンタルズ時系列セクション（SOT-1121）を株価ページから新ページへ移設した。フロントエンド単独変更。

**Worker non-response (fallback disclosure):** `scripts/ai/run_gemini.sh` exited with code 75
(Gemini CLI crashed: IneligibleTierError / UNSUPPORTED_CLIENT — free-tier no longer supported).
Codex も usage-limit cooldown (exit 75) で非応答。Per the Worker Non-Response Fallback Policy,
Claude Code performed both the implementation and the verification directly.

## Changed Files
- `frontend/src/pages/IndividualStockPage.tsx` — 新規。財務ファンダメンタルズ時系列セクションのみを表示する個別株ページ。
- `frontend/src/pages/StockPage.tsx` — 財務ファンダメンタルズの state/query/JSX セクションを削除、未使用 import（FinancialFundamentalsChart, fetchFundamentalsCompanies, fetchFinancialFundamentals）を除去。
- `frontend/src/App.tsx` — IndividualStockPage の lazy import、NAV_ITEMS に「個別株」(/individual-stock, 株価の隣)、/individual-stock ルートを追加。
- `frontend/src/i18n/messages.ts` — `nav.individualStock` を ja「個別株」/ en「Individual Stock」に追加。

## Commands Run
- `cd frontend && npm run lint` → exit 0
- `cd frontend && npm run build` → exit 0（IndividualStockPage チャンク生成、StockPage チャンク縮小を確認）

## Acceptance Criteria
- [x] New「個別株」nav item appears next to 株価
- [x] New /individual-stock page shows the financial fundamentals time series
- [x] Fundamentals section removed from StockPage (no unused imports)
- [x] lint + build pass

## Risks
- メニューラベル/ルート名は Issue 未指定のため「個別株」/`/individual-stock` を採用（可逆）。
- 既存の fundamentals.* i18n キーをそのまま再利用（重複追加なし）。

## Next Action
READY_FOR_REVIEW
