# Worker Report

## Summary
SOT-992 verification passed. Backend tests, frontend lint, and frontend build all exit 0. No application code changes were required.

Static/code checks confirm `notable_companies` now returns all ticker-bearing companies instead of the previous top-5 slice, and `/dashboard/stock` plus `/dashboard/backtest` accept `years<=30`.

Data checks confirm the seed universe has 28 companies total, 26 with tickers, and `backend/data/stock-prices.json` contains exactly those 26 ticker datasets. Available price histories start from 2000-01-03 for pre-2000 listings; newer IPO/listing tickers start from their available first trading date.

## Changed Files
- `docs/ai/60_worker_codex_report.md` — wrote this verification report.

## Commands Run
- `cd backend && source .venv/bin/activate && python -m pytest -q` — PASS (`90 passed in 2.00s`)
- `cd frontend && npm run lint` — PASS (`eslint .`, exit 0)
- `cd frontend && npm run build` — PASS (`tsc -b && vite build`, exit 0; Vite emitted only the existing large chunk warning)
- `python - <<'PY' ...` — PASS data/code acceptance check:
  - `seed_companies 28`
  - `seed_ticker_companies 26`
  - `stock_tickers_excluding_meta 26`
  - `all_seed_tickers_present True`
  - `missing_from_json []`
  - `extra_in_json []`
  - `earliest_start 2000-01-03`
  - `oldest_latest_date 2026-06-18`

## Acceptance Criteria
- [x] backend pytest pass
- [x] frontend lint pass
- [x] frontend build pass
- [x] notable_companies が ticker 保有の全社（>5）を返す（コード/挙動確認）
- [x] /stock years<=30 を受け付ける
- [x] stock-prices.json が26銘柄・2000年からのデータを保持

## Risks
- `stock-prices.json` includes newer listed tickers whose histories cannot start in 2000 because the instruments did not trade then: `ANET` starts 2014-06-06, `ARM` 2023-09-14, `AVGO` 2009-08-06, `SMCI` 2007-03-29, `TSLA` 2010-06-29, `VRT` 2018-08-02. This is expected for actual market history, but worth noting if a strict "every ticker has a 2000 row" interpretation appears in review.
- Frontend production build still warns that the main JS chunk is larger than 500 kB after minification. This is non-blocking and unrelated to SOT-992.

## Next Action
READY_FOR_REVIEW
