# Worker Report (Claude Code Fallback)

## Fallback Disclosure (audit)
- Non-responsive worker: **Gemini CLI**
- Detected failure mode: `scripts/ai/run_gemini.sh` exited **75** (WORKER_NONRESPONSE) due to
  `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals`
  (free-tier permanently ineligible / crash exit 1).
- Action: Per the Worker Non-Response Fallback Policy, Claude Code performed the implementation
  (Gemini's role) directly. Verification was delegated normally to Codex CLI (responsive, exit 0).

## Summary
SOT-992「注目企業の株価追加」: テーマ別の注目企業ユニバースを拡張し、各社の2000年からの
日次株価を収集・サーバ登録し、ダッシュボードを2000年レンジ・拡張ユニバース対応にした。

- 注目企業: 10社 → 28社（ティッカー保有26社＋ティッカー無し2社 Kioxia/SanDisk）。各社に関連テーマ
  (theme_ids) を付与し、SQLite(local) と Firestore(本番) の両 seed で同一定義を冪等登録。
- 株価データ: `backend/data/stock-prices.json` を26銘柄・2000年からの日次終値＋財務スナップショットに
  再生成（yfinance、開発時オフライン収集。ランタイム依存には追加しない）。
- API: `notable_companies` の上限5を撤廃しティッカー保有の全社を返す。`/stock`・`/backtest` の
  years 上限を le=20 → le=30 に拡大（2000年=約26年）。
- フロント: 注目企業の株価取得年数を 10 → 30 年に拡大し、ダッシュボード/株価ページが2000年から表示。

## Changed Files
- `backend/scripts/collect_stock_data.py` — DEFAULT_TICKERS を26銘柄に拡張、`--start` で2000年から全期間取得。
- `backend/data/stock-prices.json` — 26銘柄・2000年からの日次株価に再生成（約5.7MB）。
- `backend/app/seed.py` — `_DASHBOARD_COMPANIES` を28社に拡張・themes 付与、`_company_row()` 追加、
  run_seed / seed_dashboard_data_firestore を新ユニバースへ。
- `backend/app/routers/dashboard.py` — notable_companies 5社上限撤廃、years le=30 化。
- `frontend/src/pages/dashboardData.ts` — useTickerStocks 取得年数 10→30 (STOCK_YEARS)。
- `frontend/src/pages/StockPage.tsx` — コメント「過去10年」→「2000年から」。

## Commands Run
- `python scripts/collect_stock_data.py --start 2000-01-01` — 26銘柄収集 OK。
- 検証は Codex CLI に委譲（pytest 90 passed / lint pass / build pass）。詳細は 60_worker_codex_report.md。

## Acceptance Criteria
- [x] テーマ別の注目企業ユニバース拡張＋theme_ids 付き登録（SQLite/Firestore）
- [x] notable_companies が ticker 保有の全社（>5）を返す
- [x] /stock /backtest が years<=30（2000年レンジ）を受け付ける
- [x] ダッシュボード/株価ページが2000年から株価・時価総額を表示
- [x] backend pytest / frontend lint+build pass

## Risks
- 2000年以降に上場した銘柄（ANET/ARM/AVGO/SMCI/TSLA/VRT）は上場日からの履歴（実市場どおり）。
- stock-prices.json は約5.7MB（同梱データ方針どおり。ランタイムは同梱JSONを読むのみ）。
- 時価総額の時系列は yfinance に無いため、フロントは現在の market_cap × 株価比率で近似（既存仕様）。

## Next Action
READY_FOR_REVIEW
