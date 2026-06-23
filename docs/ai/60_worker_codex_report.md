# Worker Report

## Summary
SOT-1146 is ACTIONABLE. Task check performed by Claude Code under the Worker Non-Response Fallback Policy because Codex was non-responsive.

- Non-responsive worker: Codex (`scripts/ai/run_codex.sh`)
- Detected failure mode: usage-limit cooldown — exited with dedicated non-response code `75` (CODEX_COOLDOWN_ACTIVE).
- Action: Claude Code performed the read-only task check directly.

The issue requires reworking `frontend/src/pages/InvestorsPage.tsx` to show ONLY per-investor pie charts and remove all other sections.

## Changed Files
- none (read-only task check)

## Commands Run
- git status, ls frontend/src/pages, read of InvestorsPage.tsx and HoldingsConcentrationPie.tsx

## Findings
- InvestorsPage.tsx exists. Sections present (all but the per-investor pie are to be removed):
  - 機関投資家 13F 保有テーブル — REMOVE
  - 保有推移（四半期）HoldingsTrendLines — REMOVE
  - 保有集中度 HoldingsConcentrationPie (企業別・全体集計1枚) — REPLACE with per-investor pies
  - 投資家 → 企業 関係 — REMOVE
  - 注目企業 TOP5 — REMOVE
  - サプライチェーン連鎖 + 連鎖図 SupplyChainGraphView — REMOVE
- Investors data (fetchInvestors) fields: investor_name, company_name/company_id, ticker, shares, value_usd, ownership_pct, change_pct, quarter_delta, report_date. Enough to build a per-investor pie: group by investor_name, latest report per (investor, company), slice by company, weight by value_usd (fallback ownership_pct).
- Reusable pie: HoldingsConcentrationPie.tsx uses recharts PieChart/Pie/Cell/Tooltip/Legend/ResponsiveContainer, TOP_N=8 + "その他" aggregation, SERIES_COLORS.
- i18n: investors.* keys exist in frontend/src/i18n/messages.ts.
- Quality gate scripts: to be confirmed by implementer from frontend/package.json.

## Acceptance Criteria (derived; issue has none explicit)
- [ ] 投資家ページが投資家ごとの円グラフのみで構成される
- [ ] 13Fテーブル / 保有推移 / 投資家→企業関係 / 注目企業TOP5 / サプライチェーン連鎖（連鎖図含む）が削除される
- [ ] lint / typecheck / build が pass

## Risks
- value_usd が null の投資家は ownership_pct にフォールバック。
- 削除で未使用 import が残ると lint/typecheck エラー → 確実に除去すること。

## Next Action
READY_FOR_REVIEW
