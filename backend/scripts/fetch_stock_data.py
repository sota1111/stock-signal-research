#!/usr/bin/env python3
"""指定銘柄の過去株価・財務情報を yfinance 経由で取得するCLI（SOT-842 / 親SOT-837）。

外部APIキーは不要。取得結果を統一JSON形状で標準出力またはファイルへ書き出し、
`--save` 指定時は StockPrice テーブル（local: SQLite / production: Firestore）へ株価を保存する。

使用方法:
    cd /workspaces/stock-signal-research/backend
    # 米国株
    APP_ENV=local python scripts/fetch_stock_data.py --ticker AAPL --years 10
    # 日本株（数字コードのみでも可。自動で .T 付与）
    APP_ENV=local python scripts/fetch_stock_data.py --ticker 7203 --out data/toyota.json
    # 取得した株価を DB へ保存
    APP_ENV=local python scripts/fetch_stock_data.py --ticker AAPL --save
"""

import os
import sys
import json
import argparse

# backend ディレクトリを sys.path に追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.market_data import fetch_stock_data, to_stock_price_rows  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="yfinanceで株価・財務情報を取得する")
    parser.add_argument("--ticker", required=True, help="銘柄コード/ティッカー（日本株は数字コードのみでも可）")
    parser.add_argument("--years", type=int, default=10, help="取得する過去年数（既定10）")
    parser.add_argument("--out", default=None, help="出力先JSONファイル（未指定なら標準出力）")
    parser.add_argument("--save", action="store_true", help="取得した株価を StockPrice テーブルへ保存する")
    args = parser.parse_args()

    data = fetch_stock_data(args.ticker, years=args.years)

    payload = json.dumps(data, ensure_ascii=False, indent=2)
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
        print(f"Wrote stock data to {args.out} (prices: {len(data['prices'])})")
    else:
        print(payload)

    if args.save and data.get("prices"):
        from app.repositories.stock_price_repository import get_stock_price_repository

        rows = to_stock_price_rows(args.ticker, data)
        ok = get_stock_price_repository().save_many(rows)
        if ok:
            print(f"Saved {len(rows)} price rows for {data['ticker']}")
        else:
            print(f"Failed to save price rows for {data['ticker']}", file=sys.stderr)
            return 1

    if data.get("error"):
        print(f"WARN: {data['error']}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
