# Worker Report

## Summary
SOT-1146 投資家ページ改修: 投資家ページを「投資家ごとの円グラフのみ」に作り替えた。

**Worker Non-Response Fallback Policy disclosure:**
- Non-responsive worker: Gemini (`scripts/ai/run_gemini.sh`)
- Detected failure mode: crash / auth — IneligibleTierError (UNSUPPORTED_CLIENT), exit handled as non-response code 75.
- Also Codex was non-responsive (usage-limit cooldown, exit 75) for the task check.
- Action: Claude Code performed implementation AND verification directly under the fallback policy. Quality gates applied unchanged.

## Changed Files
- `frontend/src/pages/InvestorsPage.tsx` — 全面書き換え。fetchInvestors のみ取得し、投資家ごとに円グラフ(ChartCard)を並べる。13Fテーブル/保有推移/保有集中度(全体1枚)/投資家→企業関係/注目企業TOP5/サプライチェーン連鎖(連鎖図含む)を削除。未使用 import を全除去。
- `frontend/src/components/charts/InvestorHoldingsPie.tsx` — 新規。投資家1人の保有内訳円グラフ。スライス=企業、重み=value_usd(なければownership_pct)、シェア%表示、上位8社+その他に集約。HoldingsConcentrationPie の recharts パターンを踏襲（既存コンポーネントは未変更）。
- `frontend/src/i18n/messages.ts` — investors.byInvestor.title / subtitle を ja/en に追加。

## Commands Run
- `npm run lint` → exit 0
- `npm run build` (tsc -b && vite build, 型チェック込み) → exit 0

## Acceptance Criteria
- [x] 投資家ページが投資家ごとの円グラフのみで構成される
- [x] 13Fテーブル/保有推移/投資家→企業関係/注目企業TOP5/サプライチェーン連鎖が削除される
- [x] lint / build(typecheck) pass

## Risks
- value_usd が無い投資家は ownership_pct を重みにフォールバック（シェア%は相対値なので両者混在でも各円グラフ単位では整合）。
- HoldingsConcentrationPie は他ページ用に未変更のまま残置。

## Next Action
READY_FOR_REVIEW
