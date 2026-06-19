"""yfinanceベースの株価・財務取得サービス（SOT-842 / 親SOT-837）。

外部APIキーは不要。yfinance（Yahoo Finance 非公式ラッパ）を用いて、指定銘柄の
過去株価・基礎的な財務指標を取得し、stock-signal-research が利用しやすい統一JSON形状で返す。

- 日本株は数字コード（例 "7203"）に `.T` を付与して Yahoo ティッカーへ正規化する。
- ネットワーク/データ取得に失敗しても例外を投げず、`error` を設定した同一形状の dict を返す。
- テスト容易性のため、`fetch_stock_data` は `yf=` で yfinance 互換オブジェクトを注入できる
  （注入時はネットワークに触れない）。
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def normalize_ticker(ticker: str) -> str:
    """ティッカーを Yahoo Finance 形式へ正規化する。

    - 全て数字（日本株の証券コード、例 "7203"）→ ".T" を付与（例 "7203.T"）。
    - それ以外 → 前後空白を除去し大文字化（例 "aapl" → "AAPL"）。
    """
    t = (ticker or "").strip()
    if not t:
        return t
    if t.isdigit():
        return f"{t}.T"
    return t.upper()


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        f = float(value)
        # NaN 判定（NaN != NaN）
        if f != f:
            return None
        return f
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> Optional[int]:
    f = _safe_float(value)
    return int(f) if f is not None else None


def _extract_prices(hist: Any) -> List[Dict[str, Any]]:
    """yfinance の history DataFrame から昇順の {date, close} リストを抽出する。"""
    prices: List[Dict[str, Any]] = []
    if hist is None:
        return prices
    try:
        if len(hist) == 0:
            return prices
    except TypeError:
        return prices
    try:
        for idx, row in hist.iterrows():
            try:
                date = idx.strftime("%Y-%m-%d")
            except AttributeError:
                date = str(idx)[:10]
            close = _safe_float(row["Close"]) if "Close" in row else _safe_float(row.get("close"))
            if close is None:
                continue
            prices.append({"date": date, "close": round(close, 4)})
    except Exception as e:  # pragma: no cover - 防御的
        logger.error(f"_extract_prices failed: {e}")
        return []
    prices.sort(key=lambda p: p["date"])
    return prices


def _empty_result(ticker: str, years: int, error: str) -> Dict[str, Any]:
    return {
        "ticker": ticker,
        "name": None,
        "currency": None,
        "period": {"years": years, "from": None, "to": None},
        "prices": [],
        "financials": {
            "market_cap": None,
            "trailing_pe": None,
            "forward_pe": None,
            "dividend_yield": None,
            "fifty_two_week_high": None,
            "fifty_two_week_low": None,
        },
        "source": "yfinance",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "error": error,
    }


def fetch_stock_data(ticker: str, years: int = 10, *, yf: Any = None) -> Dict[str, Any]:
    """指定銘柄の過去株価・財務指標を yfinance から取得し統一JSON形状の dict で返す。

    Args:
        ticker: 銘柄コード/ティッカー（日本株は数字コードのみでも可）。
        years: 取得する過去年数（履歴 period に使用）。
        yf: yfinance 互換オブジェクト（テスト用注入）。未指定時は yfinance を遅延 import。

    失敗時も例外は投げず、`error` を設定した同一形状の dict を返す。
    """
    normalized = normalize_ticker(ticker)
    if not normalized:
        return _empty_result(normalized, years, "empty ticker")

    if yf is None:
        try:
            import yfinance as yf  # type: ignore
        except Exception as e:
            logger.error(f"yfinance import failed: {e}")
            return _empty_result(normalized, years, f"yfinance unavailable: {e}")

    try:
        ticker_obj = yf.Ticker(normalized)
    except Exception as e:
        logger.error(f"yf.Ticker failed for {normalized}: {e}")
        return _empty_result(normalized, years, f"ticker init failed: {e}")

    # 履歴（株価）
    try:
        hist = ticker_obj.history(period=f"{years}y")
    except Exception as e:
        logger.error(f"history fetch failed for {normalized}: {e}")
        return _empty_result(normalized, years, f"history fetch failed: {e}")

    prices = _extract_prices(hist)

    # 財務指標（info / fast_info）
    info: Dict[str, Any] = {}
    try:
        info = ticker_obj.info or {}
    except Exception as e:
        logger.warning(f"info fetch failed for {normalized}: {e}")
        info = {}

    financials = {
        "market_cap": _safe_int(info.get("marketCap")),
        "trailing_pe": _safe_float(info.get("trailingPE")),
        "forward_pe": _safe_float(info.get("forwardPE")),
        "dividend_yield": _safe_float(info.get("dividendYield")),
        "fifty_two_week_high": _safe_float(info.get("fiftyTwoWeekHigh")),
        "fifty_two_week_low": _safe_float(info.get("fiftyTwoWeekLow")),
    }

    error: Optional[str] = None
    if not prices:
        error = "no price data returned"

    return {
        "ticker": normalized,
        "name": info.get("shortName") or info.get("longName"),
        "currency": info.get("currency"),
        "period": {
            "years": years,
            "from": prices[0]["date"] if prices else None,
            "to": prices[-1]["date"] if prices else None,
        },
        "prices": prices,
        "financials": financials,
        "source": "yfinance",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "error": error,
    }


def to_stock_price_rows(ticker: str, data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """fetch_stock_data の結果を StockPriceRepository.save_many 用の行リストへ変換する。"""
    normalized = normalize_ticker(ticker)
    rows: List[Dict[str, Any]] = []
    for p in data.get("prices", []):
        if p.get("date") is None or p.get("close") is None:
            continue
        rows.append({"ticker": normalized, "date": p["date"], "close": float(p["close"])})
    return rows
