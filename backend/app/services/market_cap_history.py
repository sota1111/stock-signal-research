"""カテゴリ（テーマ）別の真の歴史的時価総額グラフ用データを組み立てるサービス (SOT-1056 / 子SOT-1065)。

方針 A-1 + B-3:
- カテゴリ = 100テーマ（Theme 単位）。
- 各テーマに紐づく企業のうち、`backend/data/market-cap-history.json`（SEC EDGAR 由来の
  真の歴史的時価総額。米国上場株・2009年〜）に基づき、**ある年に時価総額上位 top_n に
  一度でも入った企業（期間通算の和集合）** を採用してグラフ系列にする。
- フロント側の近似（現在時価総額 × 株価比）は使わない。

`market-cap-history.json` が存在しない場合（収集前）も例外は投げず、空系列を返す。
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
)
_DATA_PATH = os.path.join(_DATA_DIR, "market-cap-history.json")
# 非米国(JP/KR)時価総額（USD換算・近似 / SOT-1122）。米国SEC実測データにマージする。
_NONUS_DATA_PATH = os.path.join(_DATA_DIR, "market-cap-history-nonus.json")

_CACHE: Optional[Dict[str, Any]] = None


def _slug(text: str) -> str:
    """seed.py の _slug と同一。'GPU memory bottleneck' -> 'gpu-memory-bottleneck'."""
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")


def _load_json_file(target: str) -> Dict[str, Any]:
    """JSONファイルを読み込む。無ければ空dict（例外を投げない）。"""
    try:
        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}
    except Exception as e:  # pragma: no cover - 防御的
        logger.error(f"market-cap history load failed ({target}): {e}")
        data = {}
    return data if isinstance(data, dict) else {}


def load_market_cap_history(path: Optional[str] = None) -> Dict[str, Any]:
    """時価総額履歴を読み込みキャッシュする。無ければ空dict。

    `path` を明示した場合はそのファイルのみ読む（テスト用・後方互換）。
    `path` 省略時は米国(SEC実測) + 非米国(JP/KR・USD換算近似 / SOT-1122) をマージして返す。
    """
    global _CACHE
    if path is not None:
        return _load_json_file(path)

    if _CACHE is not None:
        return _CACHE

    data = _load_json_file(_DATA_PATH)
    # 非米国データをマージ（ticker キーで上書きせず追加。`_meta` は除外）。
    nonus = _load_json_file(_NONUS_DATA_PATH)
    for ticker, entry in nonus.items():
        if ticker == "_meta" or not isinstance(entry, dict):
            continue
        data.setdefault(ticker, entry)
    _CACHE = data
    return data


def _reset_cache() -> None:
    """テスト用: キャッシュをクリアする。"""
    global _CACHE
    _CACHE = None


def _parse_theme_ids(raw: Any) -> List[str]:
    """company.theme_ids（JSON文字列 or list）をテーマIDリストに正規化する。"""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw]
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except (ValueError, TypeError):
            return [s]
    return []


def _ticker_history(history: Dict[str, Any], ticker: str) -> Optional[Dict[str, Any]]:
    """ティッカーの履歴エントリを返す（大文字・サフィックス除去で照合）。"""
    if not ticker:
        return None
    candidates = [ticker, ticker.upper(), ticker.upper().split(".")[0]]
    for c in candidates:
        entry = history.get(c)
        if isinstance(entry, dict) and entry.get("mcap_yearly"):
            return entry
    return None


def build_category_market_cap(
    theme_id: str,
    theme_repo,
    company_repo,
    top_n: int = 10,
) -> Dict[str, Any]:
    """指定テーマの上位 top_n 社（ever-top-N 和集合）の年次時価総額系列を返す。

    Returns dict:
        theme_id, theme_name, currency, note,
        series: [{key(ticker), name}],  # 直近時価総額の降順
        years:  [int, ...],
        points: [{year, values: {ticker: market_cap}}],
    """
    theme = theme_repo.get_by_id(theme_id)
    theme_name = theme.get("name") if theme else None
    canonical_id = f"theme-{_slug(theme_name)}" if theme_name else theme_id

    history = load_market_cap_history()

    # 1) テーマに紐づく企業（ティッカー保有のみ）。SQLite(uuid) / Firestore(slug) 両対応のため
    #    company.theme_ids（=theme-slug）と、テーマ名から計算した canonical_id で照合する。
    member_tickers: Dict[str, str] = {}  # ticker -> company name
    for c in company_repo.list_all():
        ticker = c.get("ticker") if isinstance(c, dict) else getattr(c, "ticker", None)
        if not ticker:
            continue
        ids = _parse_theme_ids(c.get("theme_ids") if isinstance(c, dict) else getattr(c, "theme_ids", None))
        if canonical_id in ids or theme_id in ids:
            name = c.get("name") if isinstance(c, dict) else getattr(c, "name", ticker)
            member_tickers.setdefault(ticker, name or ticker)

    # 2) 履歴データを持つ企業だけ採用（米国SEC実測 + 非米国USD換算近似・2009〜）。
    per_ticker_yearly: Dict[str, Dict[int, float]] = {}
    names: Dict[str, str] = {}
    meta: Dict[str, Dict[str, Any]] = {}  # ticker -> {currency, exchange, provenance}
    for ticker, name in member_tickers.items():
        entry = _ticker_history(history, ticker)
        if not entry:
            continue
        yearly = {}
        for row in entry.get("mcap_yearly", []):
            year = row.get("year")
            mcap = row.get("market_cap")
            if year is None or mcap is None:
                continue
            yearly[int(year)] = float(mcap)
        if yearly:
            per_ticker_yearly[ticker] = yearly
            names[ticker] = entry.get("name") or name
            # 通貨/上場市場/来歴（非米国はファイルに保持、米国はデフォルト）。
            meta[ticker] = {
                "currency": entry.get("currency", "USD"),
                "exchange": entry.get("exchange"),
                "provenance": entry.get("provenance", "real"),
            }

    note = (
        "米国(SEC実測・株価×開示株式数) + 非米国(JP/KR)はUSD換算の近似値。"
        "値はすべてUSD換算・2009年〜。"
    )
    if not per_ticker_yearly:
        return {
            "theme_id": theme_id,
            "theme_name": theme_name,
            "currency": "USD",
            "note": note,
            "series": [],
            "years": [],
            "points": [],
        }

    # 3) 年ごとに時価総額ランキング → 一度でも top_n に入った企業を採用（和集合）。
    all_years = sorted({y for yearly in per_ticker_yearly.values() for y in yearly})
    selected: set[str] = set()
    for year in all_years:
        ranked = sorted(
            ((t, yv[year]) for t, yv in per_ticker_yearly.items() if year in yv),
            key=lambda kv: kv[1],
            reverse=True,
        )
        for ticker, _ in ranked[:top_n]:
            selected.add(ticker)

    # 4) 系列の並び順 = 直近年の時価総額降順。
    latest_year = all_years[-1]

    def _latest_mcap(t: str) -> float:
        yv = per_ticker_yearly[t]
        for y in range(latest_year, all_years[0] - 1, -1):
            if y in yv:
                return yv[y]
        return 0.0

    ordered = sorted(selected, key=_latest_mcap, reverse=True)
    series = [
        {
            "key": t,
            "name": names.get(t, t),
            "currency": meta.get(t, {}).get("currency", "USD"),
            "exchange": meta.get(t, {}).get("exchange"),
            "provenance": meta.get(t, {}).get("provenance", "real"),
        }
        for t in ordered
    ]

    points = []
    for year in all_years:
        values = {t: per_ticker_yearly[t][year] for t in ordered if year in per_ticker_yearly[t]}
        if values:
            points.append({"year": year, "values": values})

    return {
        "theme_id": theme_id,
        "theme_name": theme_name,
        "currency": "USD",
        "note": note,
        "series": series,
        "years": all_years,
        "points": points,
    }


def list_categories(theme_repo, company_repo) -> List[Dict[str, Any]]:
    """全テーマ（カテゴリ）一覧を返す。market-cap 履歴データの有無フラグ付き。

    フロントのカテゴリセレクタ用。`has_market_cap` が True のテーマだけがグラフを描ける。
    """
    history = load_market_cap_history()

    # ティッカー → 履歴有無
    def _has_hist(ticker: Optional[str]) -> bool:
        return _ticker_history(history, ticker) is not None if ticker else False

    # テーマID(canonical) → 紐づく履歴ありティッカー数
    companies = company_repo.list_all()
    out = []
    for theme in theme_repo.list_all():
        name = theme.get("name")
        canonical_id = f"theme-{_slug(name)}" if name else theme.get("id")
        count = 0
        for c in companies:
            ticker = c.get("ticker") if isinstance(c, dict) else getattr(c, "ticker", None)
            if not ticker:
                continue
            ids = _parse_theme_ids(c.get("theme_ids") if isinstance(c, dict) else getattr(c, "theme_ids", None))
            if canonical_id in ids or theme.get("id") in ids:
                if _has_hist(ticker):
                    count += 1
        out.append({
            "theme_id": theme.get("id"),
            "theme_name": name,
            "category": theme.get("category"),
            "company_count": count,
            "has_market_cap": count > 0,
        })
    # 履歴ありを上に、その中で件数降順、次にテーマ名
    out.sort(key=lambda r: (not r["has_market_cap"], -r["company_count"], str(r["theme_name"])))
    return out
