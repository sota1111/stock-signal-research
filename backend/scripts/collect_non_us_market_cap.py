"""非米国（JP/KR）主要銘柄の「年次・USD換算 時価総額」を組み立てる (SOT-1122 / 親SOT-1111 候補E)。

背景:
  `collect_market_cap_history.py` は SEC EDGAR (CIK) を使うため **米国上場株のみ** を対象とし、
  Samsung / SK hynix / Tokyo Electron / Advantest / Fujikura など非米国の半導体主役が
  時価総額グラフから欠落していた。SEC に CIK が無いこれらは別経路でデータを作る必要がある。

データソースと方式（**近似 / approximate**）:
  - 年末株価（現地通貨・配当/分割調整済み）は同梱 `backend/data/stock-prices.json` を使用
    （yfinance auto_adjust。生の発行株式数×生株価ではないため "真の時価総額" ではない）。
  - 各銘柄の「実効株式数」「現在時価総額（現地通貨）」「上場通貨/取引所」、および年末FX
    （現地通貨/USD）は、Yahoo Finance から 2026-06-23 時点でスナップショットした **埋め込み定数**
    （下記 `SNAPSHOT` / `FX_PER_USD`）。ネットワーク不要で再現できるようにここに固定する。
  - 実効株式数 = 現在時価総額(現地) ÷ 直近の調整後終値。各年の時価総額(現地) = 調整後終値 × 実効株式数。
    USD換算 = 時価総額(現地) ÷ 年末FX(現地通貨/USD)。

  株式数を一定（現在値）とし調整後終値で按分する近似のため、来歴は **「近似(approx)」** として
  マークする（米国=SEC実測 "real" と区別。SOT-1125 のデータ来歴バッジに対応）。

出力: `backend/data/market-cap-history-nonus.json`
  { "005930.KS": {"name","currency","exchange","provenance":"approx",
                  "mcap_yearly":[{"year","market_cap"(USD),"close"(local),"shares","fx_rate","currency"}, ...]},
    ..., "_meta": {...} }

実行:
    cd backend && python -m scripts.collect_non_us_market_cap
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys

MIN_YEAR = 2009  # 米国系(SEC XBRL era)と揃える

_HERE = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(_HERE, "..", "data")
STOCK_PRICES_PATH = os.path.join(_DATA_DIR, "stock-prices.json")
OUT_PATH = os.path.join(_DATA_DIR, "market-cap-history-nonus.json")

# --- Yahoo Finance スナップショット (2026-06-23) -----------------------------
# 各銘柄: 上場通貨 / 取引所 / 現在時価総額(現地通貨) / 直近約定値(現地通貨, 実効株式数算出の参考)。
SNAPSHOT: dict[str, dict] = {
    "005930.KS": {
        "name": "Samsung Electronics Co., Ltd.",
        "currency": "KRW",
        "exchange": "KRX",  # Korea Exchange (KOSPI)
        "market_cap_local": 2229348274798592,
    },
    "000660.KS": {
        "name": "SK hynix Inc.",
        "currency": "KRW",
        "exchange": "KRX",
        "market_cap_local": 1986883949166592,
    },
    "8035.T": {
        "name": "Tokyo Electron Limited",
        "currency": "JPY",
        "exchange": "TSE",  # Tokyo Stock Exchange
        "market_cap_local": 35274004365312,
    },
    "6857.T": {
        "name": "Advantest Corporation",
        "currency": "JPY",
        "exchange": "TSE",
        "market_cap_local": 23476714864640,
    },
    "5803.T": {
        "name": "Fujikura Ltd.",
        "currency": "JPY",
        "exchange": "TSE",
        "market_cap_local": 10895893725184,
    },
}

# 年末FX = 現地通貨 / USD（USD/KRW, USD/JPY の年末値; 2026は2026-06-23時点）。Yahoo "KRW=X" / "JPY=X"。
FX_PER_USD: dict[str, dict[int, float]] = {
    "KRW": {
        2009: 1151.10, 2010: 1127.10, 2011: 1155.40, 2012: 1038.10, 2013: 1054.30,
        2014: 1095.30, 2015: 1175.44, 2016: 1206.26, 2017: 1066.38, 2018: 1116.30,
        2019: 1156.35, 2020: 1086.42, 2021: 1189.89, 2022: 1260.91, 2023: 1293.53,
        2024: 1467.39, 2025: 1437.91, 2026: 1534.98,
    },
    "JPY": {
        2009: 92.910, 2010: 81.480, 2011: 77.659, 2012: 85.960, 2013: 104.934,
        2014: 119.458, 2015: 120.450, 2016: 116.890, 2017: 112.680, 2018: 110.330,
        2019: 108.873, 2020: 103.121, 2021: 115.063, 2022: 131.110, 2023: 141.020,
        2024: 156.995, 2025: 156.413, 2026: 161.556,
    },
}


def load_year_end_closes(ticker: str) -> dict[int, float]:
    """ticker の {year: 年末(その年最終営業日)調整後終値(現地通貨)} を返す。"""
    with open(STOCK_PRICES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    entry = data.get(ticker)
    if not isinstance(entry, dict):
        return {}
    year_close: dict[int, tuple[str, float]] = {}
    for p in entry.get("prices", []):
        d = p.get("date")
        c = p.get("close")
        if not d or c is None:
            continue
        year = int(d[:4])
        prev = year_close.get(year)
        if prev is None or d >= prev[0]:
            year_close[year] = (d, float(c))
    return {y: v[1] for y, v in year_close.items()}


def build_entry(ticker: str, meta: dict) -> dict | None:
    closes = load_year_end_closes(ticker)
    if not closes:
        return None
    currency = meta["currency"]
    fx = FX_PER_USD.get(currency, {})
    latest_year = max(closes)
    latest_close = closes[latest_year]
    if latest_close <= 0:
        return None
    # 実効株式数 = 現在時価総額(現地) ÷ 直近調整後終値。各年は調整後終値で按分。
    effective_shares = meta["market_cap_local"] / latest_close

    mcap_yearly = []
    for year in sorted(closes):
        if year < MIN_YEAR:
            continue
        rate = fx.get(year)
        if not rate:
            continue
        close = closes[year]
        mcap_local = close * effective_shares
        mcap_usd = mcap_local / rate
        mcap_yearly.append({
            "year": year,
            "market_cap": round(mcap_usd, 2),
            "close": round(close, 4),
            "shares": round(effective_shares, 2),
            "fx_rate": rate,
            "currency": currency,
        })
    if not mcap_yearly:
        return None
    return {
        "name": meta["name"],
        "currency": currency,
        "exchange": meta["exchange"],
        "provenance": "approx",
        "mcap_yearly": mcap_yearly,
    }


def collect() -> dict:
    result: dict = {}
    for ticker, meta in SNAPSHOT.items():
        entry = build_entry(ticker, meta)
        if entry is None:
            print(f"{ticker}: 価格/FX不足 → skip", flush=True)
            continue
        result[ticker] = entry
        last = entry["mcap_yearly"][-1]
        print(
            f"{ticker} {entry['name']}: {len(entry['mcap_yearly'])}年 "
            f"({entry['mcap_yearly'][0]['year']}〜{last['year']}, "
            f"直近mcap≈{last['market_cap']:.3e} USD, {entry['currency']}/{entry['exchange']})",
            flush=True,
        )
    result["_meta"] = {
        "source": "yfinance bundled stock-prices.json (adjusted close, local currency) × "
                  "Yahoo Finance snapshot 2026-06-23 (shares/current market-cap/year-end FX)",
        "approach": "approximate: adjusted_close × effective_shares × (1/year-end FX) -> USD",
        "provenance": "approx",
        "scope": f"non-US (JP/KR) tickers, years >= {MIN_YEAR}",
        "currency_note": "近似(株式数を現在値で一定とし調整後終値で按分)。米国=SEC実測と区別。",
        "collected_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "covered_tickers": len(result),
    }
    return result


def main() -> int:
    result = collect()
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n書き出し完了: {OUT_PATH}  ({result['_meta']['covered_tickers']} ティッカー)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
