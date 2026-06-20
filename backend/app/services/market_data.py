"""株価・財務取得サービス（SOT-842 / 親SOT-837、SOT-941 でローカルseed化）。

外部APIキー不要・**ランタイムでの外部ネットワーク取得なし**。リポジトリに同梱した
`backend/data/stock-prices.json`（過去10年・日次終値＋財務スナップショット）を読み込み、
stock-signal-research が利用しやすい統一JSON形状で返す。

背景（SOT-941）:
    以前は yfinance を実行時に呼び出していたが、本番では取得に失敗してダッシュボードが
    「空表示」になった。そこで開発時に `scripts/collect_stock_data.py` で実データを一度収集して
    同梱し、サーバはその同梱JSONを読むだけにした。yfinance はサーバのランタイム依存から除外。

- 日本株は数字コード（例 "7203"）に `.T` を付与して Yahoo ティッカーへ正規化する。
- 同梱データに該当ティッカーが無い場合も例外は投げず、`error` を設定した同一形状の dict を返す。
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# 同梱株価データ（scripts/collect_stock_data.py が生成）。backend/data/stock-prices.json
_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "stock-prices.json",
)

# パース済みデータのモジュールキャッシュ（プロセス内で1回だけ読む）。
_DATASET_CACHE: Optional[Dict[str, Any]] = None


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


def _load_dataset() -> Dict[str, Any]:
    """同梱株価JSONを読み込みキャッシュする。読み込み失敗時は空dict。"""
    global _DATASET_CACHE
    if _DATASET_CACHE is not None:
        return _DATASET_CACHE
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            _DATASET_CACHE = json.load(f)
    except Exception as e:  # pragma: no cover - 防御的
        logger.error(f"stock-prices.json load failed: {e}")
        _DATASET_CACHE = {}
    return _DATASET_CACHE


def _reset_cache() -> None:
    """テスト用: データキャッシュをクリアする。"""
    global _DATASET_CACHE
    _DATASET_CACHE = None


def _filter_recent(prices: List[Dict[str, Any]], years: int) -> List[Dict[str, Any]]:
    """昇順 prices を直近 years 年に絞り込む（最新日付基準）。"""
    if not prices:
        return []
    try:
        latest = datetime.strptime(prices[-1]["date"], "%Y-%m-%d").date()
    except (ValueError, KeyError, TypeError):
        return list(prices)
    try:
        cutoff = date(latest.year - years, latest.month, latest.day)
    except ValueError:
        # 2/29 など → 3/1 にフォールバック
        cutoff = date(latest.year - years, latest.month, 28)
    return [p for p in prices if p.get("date") and p["date"] >= cutoff.isoformat()]


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
        "source": "local-seed",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "error": error,
    }


def fetch_stock_data(ticker: str, years: int = 10) -> Dict[str, Any]:
    """指定銘柄の過去株価・財務指標を同梱JSONから取得し統一JSON形状の dict で返す。

    Args:
        ticker: 銘柄コード/ティッカー（日本株は数字コードのみでも可）。
        years: 取得する過去年数（同梱データを直近 years 年に絞り込む）。

    同梱データに該当ティッカーが無い場合も例外は投げず、`error` を設定した同一形状を返す。
    """
    normalized = normalize_ticker(ticker)
    if not normalized:
        return _empty_result(normalized, years, "empty ticker")

    dataset = _load_dataset()
    entry = dataset.get(normalized)
    if not entry:
        return _empty_result(normalized, years, "no seeded data for ticker")

    all_prices = entry.get("prices") or []
    prices = _filter_recent(all_prices, years)

    raw_fin = entry.get("financials") or {}
    financials = {
        "market_cap": raw_fin.get("market_cap"),
        "trailing_pe": _safe_float(raw_fin.get("trailing_pe")),
        "forward_pe": _safe_float(raw_fin.get("forward_pe")),
        "dividend_yield": _safe_float(raw_fin.get("dividend_yield")),
        "fifty_two_week_high": _safe_float(raw_fin.get("fifty_two_week_high")),
        "fifty_two_week_low": _safe_float(raw_fin.get("fifty_two_week_low")),
    }

    error: Optional[str] = None
    if not prices:
        error = "no price data returned"

    return {
        "ticker": normalized,
        "name": entry.get("name"),
        "currency": entry.get("currency"),
        "period": {
            "years": years,
            "from": prices[0]["date"] if prices else None,
            "to": prices[-1]["date"] if prices else None,
        },
        "prices": prices,
        "financials": financials,
        "source": "local-seed",
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
