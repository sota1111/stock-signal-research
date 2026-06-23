# Worker Report (Claude Code Fallback) — SOT-1128

## Fallback Disclosure (audit)
- Worker non-responsive: **Gemini** — `scripts/ai/run_gemini.sh` exited **75**
  (`IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals`).
- Worker non-responsive: **Codex** — `scripts/ai/run_codex.sh` exited **75** (usage-limit cooldown until
  epoch 1782609660). Used for the task check; Claude Code performed it directly.
- Per the Worker Non-Response Fallback Policy, Claude Code performed both the implementation (Gemini's
  role) and verification (Codex's role) directly for SOT-1128.

## Summary
Fixed the dashboard cross-analysis (クロス分析: 論文件数 × 上位N社時価総額) card not rendering for categories /
themes that have no companies with market-cap data (e.g. user-registered「エネルギー」/「リチウムイオン
バッテリー」). The cross-analysis market-cap series now falls back to ALL notable companies' top-N market cap
when the category-scoped set yields no market-cap data, while the dedicated「上位N社時価総額」card stays
category-scoped (SOT-1081 ⑤). The global fallback fetch is only enabled when the scoped market cap is empty,
so normal categories / the all-categories view keep SOT-1081's reduced-fetch behavior with no added fetches.

## Changed Files
- `frontend/src/pages/dashboardData.ts` — `useTickerStocks(companies, options?)` gains an optional
  `enabled` flag, passed to each `useQueries` query so the fallback fetch can be conditionally disabled.
- `frontend/src/pages/DashboardPage.tsx` — compute `scopedMarketCapYearly` + `scopedSettled`; add a
  `needGlobalMarketCap`-gated global `useTickerStocks` (placed before the loading guard to keep hook count
  stable); `crossMarketCapYearly = scoped || global`; alias the cross series to `marketCapYearly`; extend
  `isMarketCapLoading` / `isCrossLoading` to cover the fallback fetch. Top10 card keeps scoped `stockItems`.

## Commands Run
- `npm run lint` → exit 0
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0 (DashboardPage chunk built)
- (frontend has no unit/e2e test runner; build = type gate per project convention)

## Acceptance Criteria
- [x] 時価総額企業の居ない大カテゴリ/テーマでもクロス分析グラフが（論文があれば）描画される
      （scoped 時価総額が空のとき全注目企業 top-N へフォールバック）
- [x] 通常カテゴリ・全カテゴリ選択時は挙動不変・追加 fetch 無し（`needGlobalMarketCap` ゲート）
- [x] 上位N社時価総額カードは従来通りカテゴリ絞り込み（scoped `stockItems`）
- [x] lint / typecheck / build pass

## Risks
- Could not reproduce the exact user DB locally (their「エネルギー」/「リチウムイオンバッテリー」are
  user-registered Japanese themes not in the seed). Fix targets the general empty-scoped-market-cap case,
  which is the reported failure mode; verified against the seed's behavior and the type/build gate.
- When the fallback is active, the cross uses the global market top-N (e.g. mega-caps) paired with the
  selected theme's papers — intentional macro context; the cross subtitle still shows the selected theme.

## Next Action
READY_FOR_REVIEW
