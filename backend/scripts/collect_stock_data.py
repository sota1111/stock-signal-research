#!/usr/bin/env python3
"""注目企業の過去株価・財務スナップショットをローカルで収集する開発用スクリプト（SOT-941）。

目的:
    サーバ実行時に yfinance を呼び出すと本番で取得失敗→ダッシュボードが「空表示」になる。
    そこで、開発時にこのスクリプトを一度だけ実行して実データ（過去10年・日次終値＋財務指標）を
    `backend/data/stock-prices.json` に同梱し、サーバはその同梱JSONを読み込む方式に切り替える。

    => yfinance はサーバの「ランタイム依存」から外し、この収集スクリプト（開発時オフライン実行）
       にのみ閉じ込める。requirements.txt にも含めない。再収集する場合のみ手動で
       `pip install yfinance` してから実行する。

使用方法:
    cd /workspaces/stock-signal-research/backend
    pip install yfinance   # サーバ依存ではないため手動インストール
    python scripts/collect_stock_data.py            # 既定の注目企業ティッカーを収集
    python scripts/collect_stock_data.py --years 10 # 取得年数を指定

出力:
    backend/data/stock-prices.json
    形状: { "<TICKER>": { "name", "currency", "financials": {...}, "prices": [{"date","close"}] } }
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone

# backend ディレクトリを sys.path に追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.market_data import normalize_ticker  # noqa: E402

# 注目企業（seed.py の _DASHBOARD_COMPANIES と整合する実ティッカー）。SOT-992 で
# テーマ別の注目企業ユニバースを拡張し、2000年からの株価を収集する。
# ティッカー未設定の企業（Kioxia / SanDisk 等）は株価グラフ対象外。
DEFAULT_TICKERS = [
    "NVDA",       # NVIDIA
    "AMD",        # AMD
    "TSM",        # TSMC
    "INTC",       # Intel
    "MU",         # Micron
    "AVGO",       # Broadcom
    "QCOM",       # Qualcomm
    "TXN",        # Texas Instruments
    "AMAT",       # Applied Materials
    "LRCX",       # Lam Research
    "KLAC",       # KLA
    "MRVL",       # Marvell
    "ON",         # ON Semiconductor
    "WDC",        # Western Digital
    "ANET",       # Arista Networks
    "SMCI",       # Super Micro Computer
    "VRT",        # Vertiv
    "ARM",        # Arm Holdings
    "TSLA",       # Tesla
    "ASML",       # ASML
    "STM",        # STMicroelectronics
    "005930.KS",  # Samsung
    "000660.KS",  # SK hynix
    "8035.T",     # Tokyo Electron
    "6857.T",     # Advantest
    "5803.T",     # Fujikura
]

DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "stock-prices.json"
)


def _safe_float(value):
    try:
        if value is None:
            return None
        f = float(value)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def _safe_int(value):
    f = _safe_float(value)
    return int(f) if f is not None else None


def _extract_prices(hist):
    """yfinance history DataFrame から昇順の {date, close} リストを抽出する。"""
    prices = []
    if hist is None or len(hist) == 0:
        return prices
    for idx, row in hist.iterrows():
        try:
            date = idx.strftime("%Y-%m-%d")
        except AttributeError:
            date = str(idx)[:10]
        close = _safe_float(row.get("Close"))
        if close is None:
            continue
        prices.append({"date": date, "close": round(close, 4)})
    prices.sort(key=lambda p: p["date"])
    return prices


def collect_one(yf, ticker, years, start=None):
    normalized = normalize_ticker(ticker)
    obj = yf.Ticker(normalized)
    if start:
        # 明示的な開始日（例 2000-01-01）からの全期間を取得する。
        hist = obj.history(start=start, auto_adjust=True)
    else:
        hist = obj.history(period=f"{years}y")
    prices = _extract_prices(hist)
    try:
        info = obj.info or {}
    except Exception:
        info = {}
    return normalized, {
        "name": info.get("shortName") or info.get("longName"),
        "currency": info.get("currency"),
        "financials": {
            "market_cap": _safe_int(info.get("marketCap")),
            "trailing_pe": _safe_float(info.get("trailingPE")),
            "forward_pe": _safe_float(info.get("forwardPE")),
            "dividend_yield": _safe_float(info.get("dividendYield")),
            "fifty_two_week_high": _safe_float(info.get("fiftyTwoWeekHigh")),
            "fifty_two_week_low": _safe_float(info.get("fiftyTwoWeekLow")),
        },
        "prices": prices,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="注目企業の株価データをローカル収集する（SOT-941）")
    parser.add_argument("--years", type=int, default=10, help="取得する過去年数（既定10。--start指定時は無視）")
    parser.add_argument("--start", default=None, help="取得開始日 YYYY-MM-DD（例 2000-01-01。指定時は全期間取得）")
    parser.add_argument("--out", default=DATA_PATH, help="出力先JSON（既定 backend/data/stock-prices.json）")
    parser.add_argument("--tickers", nargs="*", default=DEFAULT_TICKERS, help="収集するティッカー")
    args = parser.parse_args()

    try:
        import yfinance as yf  # 遅延 import。サーバ依存ではない。
    except Exception as e:  # pragma: no cover
        print(f"yfinance が必要です: pip install yfinance ({e})", file=sys.stderr)
        return 1

    dataset = {
        "_meta": {
            "source": "yfinance",
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "years": args.years,
            "start": args.start,
        }
    }
    for ticker in args.tickers:
        try:
            normalized, payload = collect_one(yf, ticker, args.years, start=args.start)
            dataset[normalized] = payload
            print(f"  {normalized}: {len(payload['prices'])} prices, name={payload['name']}")
        except Exception as e:  # pragma: no cover
            print(f"  WARN: failed to collect {ticker}: {e}", file=sys.stderr)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, separators=(",", ":"))
    tickers_written = [k for k in dataset.keys() if k != "_meta"]
    print(f"Wrote {len(tickers_written)} tickers to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
