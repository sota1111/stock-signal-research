"""yfinance ベース株価・財務取得サービスのテスト（SOT-842）。

ネットワークには一切アクセスしない。yfinance 互換のフェイクを `yf=` で注入する。
"""

import pandas as pd

from app.services.market_data import (
    normalize_ticker,
    fetch_stock_data,
    to_stock_price_rows,
)


class _FakeTicker:
    def history(self, period=None):
        idx = pd.to_datetime(["2022-01-05", "2022-01-03", "2022-01-04"])
        # わざと日付を非昇順で渡し、サービス側でソートされることを確認する
        return pd.DataFrame({"Close": [149.25, 150.0, 152.5]}, index=idx)

    @property
    def info(self):
        return {
            "shortName": "Apple Inc.",
            "currency": "USD",
            "marketCap": 3000000000000,
            "trailingPE": 30.5,
            "forwardPE": 28.1,
            "dividendYield": 0.005,
            "fiftyTwoWeekHigh": 199.0,
            "fiftyTwoWeekLow": 124.0,
        }


class _FakeYF:
    def Ticker(self, symbol):
        return _FakeTicker()


class _FailingTicker:
    def history(self, period=None):
        raise RuntimeError("network down")

    @property
    def info(self):
        return {}


class _FailingYF:
    def Ticker(self, symbol):
        return _FailingTicker()


def test_normalize_ticker_japanese_code():
    assert normalize_ticker("7203") == "7203.T"


def test_normalize_ticker_us_symbol_uppercased():
    assert normalize_ticker("aapl") == "AAPL"
    assert normalize_ticker(" msft ") == "MSFT"


def test_fetch_stock_data_success():
    data = fetch_stock_data("aapl", years=10, yf=_FakeYF())

    assert data["error"] is None
    assert data["ticker"] == "AAPL"
    assert data["name"] == "Apple Inc."
    assert data["currency"] == "USD"
    assert data["source"] == "yfinance"

    # prices は日付昇順にソートされている
    dates = [p["date"] for p in data["prices"]]
    assert dates == ["2022-01-03", "2022-01-04", "2022-01-05"]
    assert data["period"]["from"] == "2022-01-03"
    assert data["period"]["to"] == "2022-01-05"

    # financials が抽出されている
    assert data["financials"]["market_cap"] == 3000000000000
    assert data["financials"]["trailing_pe"] == 30.5
    assert data["financials"]["fifty_two_week_high"] == 199.0


def test_to_stock_price_rows():
    data = fetch_stock_data("7203", years=5, yf=_FakeYF())
    rows = to_stock_price_rows("7203", data)

    assert len(rows) == 3
    assert all(r["ticker"] == "7203.T" for r in rows)
    assert rows[0]["date"] == "2022-01-03"
    assert isinstance(rows[0]["close"], float)


def test_fetch_stock_data_failure_does_not_raise():
    data = fetch_stock_data("AAPL", years=10, yf=_FailingYF())

    assert data["error"] is not None
    assert data["prices"] == []
    assert data["financials"]["market_cap"] is None
    assert data["ticker"] == "AAPL"


def test_fetch_stock_data_empty_ticker():
    data = fetch_stock_data("", yf=_FakeYF())
    assert data["error"] is not None
    assert data["prices"] == []
