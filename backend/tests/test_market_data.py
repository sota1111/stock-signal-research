"""同梱株価データ（backend/data/stock-prices.json）ベースの取得サービスのテスト（SOT-842 / SOT-941）。

ネットワークには一切アクセスしない。モジュールのデータキャッシュに小さなテスト用データセットを
注入して、JSON-seed 読み込み・年絞り込み・欠損ティッカーの扱いを検証する。
"""

import app.services.market_data as md
from app.services.market_data import (
    normalize_ticker,
    fetch_stock_data,
    to_stock_price_rows,
    _reset_cache,
)

_FAKE_DATASET = {
    "_meta": {"source": "yfinance"},
    "AAPL": {
        "name": "Apple Inc.",
        "currency": "USD",
        "financials": {
            "market_cap": 3000000000000,
            "trailing_pe": 30.5,
            "forward_pe": 28.1,
            "dividend_yield": 0.005,
            "fifty_two_week_high": 199.0,
            "fifty_two_week_low": 124.0,
        },
        "prices": [
            {"date": "2016-01-04", "close": 100.0},
            {"date": "2022-01-03", "close": 150.0},
            {"date": "2022-01-04", "close": 152.5},
            {"date": "2022-01-05", "close": 149.25},
        ],
    },
    "7203.T": {
        "name": "Toyota",
        "currency": "JPY",
        "financials": {"market_cap": None, "trailing_pe": None, "forward_pe": None,
                       "dividend_yield": None, "fifty_two_week_high": None, "fifty_two_week_low": None},
        "prices": [
            {"date": "2021-01-04", "close": 1400.0},
            {"date": "2022-01-04", "close": 1500.0},
        ],
    },
}


def _install_fake_dataset(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(md, "_DATASET_CACHE", dict(_FAKE_DATASET))


def test_normalize_ticker_japanese_code():
    assert normalize_ticker("7203") == "7203.T"


def test_normalize_ticker_us_symbol_uppercased():
    assert normalize_ticker("aapl") == "AAPL"
    assert normalize_ticker(" msft ") == "MSFT"


def test_fetch_stock_data_success(monkeypatch):
    _install_fake_dataset(monkeypatch)
    data = fetch_stock_data("aapl", years=10)

    assert data["error"] is None
    assert data["ticker"] == "AAPL"
    assert data["name"] == "Apple Inc."
    assert data["currency"] == "USD"
    assert data["source"] == "local-seed"

    # prices は日付昇順
    dates = [p["date"] for p in data["prices"]]
    assert dates == sorted(dates)
    assert data["period"]["to"] == "2022-01-05"

    # financials が抽出されている
    assert data["financials"]["market_cap"] == 3000000000000
    assert data["financials"]["trailing_pe"] == 30.5
    assert data["financials"]["fifty_two_week_high"] == 199.0


def test_fetch_stock_data_year_filter(monkeypatch):
    _install_fake_dataset(monkeypatch)
    # years=3 → 最新(2022-01-05)から3年遡った 2019-01-05 以降のみ。2016 の点は除外される。
    data = fetch_stock_data("AAPL", years=3)
    dates = [p["date"] for p in data["prices"]]
    assert "2016-01-04" not in dates
    assert "2022-01-03" in dates
    assert data["period"]["from"] == "2022-01-03"


def test_to_stock_price_rows(monkeypatch):
    _install_fake_dataset(monkeypatch)
    data = fetch_stock_data("7203", years=10)
    rows = to_stock_price_rows("7203", data)

    assert len(rows) == 2
    assert all(r["ticker"] == "7203.T" for r in rows)
    assert rows[0]["date"] == "2021-01-04"
    assert isinstance(rows[0]["close"], float)


def test_fetch_stock_data_missing_ticker(monkeypatch):
    _install_fake_dataset(monkeypatch)
    data = fetch_stock_data("UNKNOWN", years=10)

    assert data["error"] is not None
    assert data["prices"] == []
    assert data["financials"]["market_cap"] is None
    assert data["ticker"] == "UNKNOWN"


def test_fetch_stock_data_empty_ticker(monkeypatch):
    _install_fake_dataset(monkeypatch)
    data = fetch_stock_data("")
    assert data["error"] is not None
    assert data["prices"] == []
