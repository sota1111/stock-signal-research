"""財務ファンダメンタルズ時系列（SEC EDGAR XBRL）サービス (SOT-1121 / 候補D)。

market-cap-history (SOT-1056) と同じ「収集スクリプト→JSONデータ→キャッシュ付きサービス→
/dashboard API→recharts画面」のファイルベース方式を踏襲する。

データソースは SEC EDGAR の XBRL companyconcept。filer により概念(concept)名が異なるため、
指標ごとに優先順の concept リスト（フォールバック）を持つ。値の正規化（年次フローのみ抽出・
再表示=restatement の重複排除）はネットワークに依存しない純関数として実装し、収集スクリプトと
サービスの両方から再利用する（=ユニットテスト可能）。

`backend/data/financial-fundamentals.json` が無い場合（収集前）も例外は投げず空を返す。
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "financial-fundamentals.json",
)

_CACHE: Optional[Dict[str, Any]] = None

# 指標キー -> 表示順は METRIC_KEYS で固定。各指標は優先順の (taxonomy, concept) リスト。
# 同じ意味でも filer ごとに concept 名が違うため、先頭から順に試し最初に値が取れたものを採用する。
METRICS: List[Tuple[str, List[Tuple[str, str]]]] = [
    ("revenue", [
        ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"),
        ("us-gaap", "Revenues"),
        ("us-gaap", "SalesRevenueNet"),
    ]),
    ("gross_profit", [
        ("us-gaap", "GrossProfit"),
    ]),
    ("rnd", [
        ("us-gaap", "ResearchAndDevelopmentExpense"),
    ]),
    ("capex", [
        ("us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment"),
        ("us-gaap", "PaymentsToAcquireProductiveAssets"),
    ]),
]
METRIC_KEYS: List[str] = [m[0] for m in METRICS]

# 個別株のカテゴリ分類（SOT-1208）。financial-fundamentals.json の DEFAULT_TICKERS に対応。
# 未分類ティッカーは DEFAULT_CATEGORY("other") にフォールバックする。
TICKER_CATEGORY: Dict[str, str] = {
    # semiconductor
    "NVDA": "semiconductor", "AMD": "semiconductor", "INTC": "semiconductor",
    "QCOM": "semiconductor", "MU": "semiconductor", "AVGO": "semiconductor",
    "AMAT": "semiconductor", "LRCX": "semiconductor", "KLAC": "semiconductor",
    "MRVL": "semiconductor", "ARM": "semiconductor", "TXN": "semiconductor",
    # software & cloud
    "MSFT": "software", "ORCL": "software", "CRM": "software", "ADBE": "software",
    "NOW": "software", "IBM": "software", "CSCO": "software",
    # internet & platform
    "GOOGL": "internet", "AMZN": "internet", "META": "internet",
    # hardware & consumer
    "AAPL": "hardware", "TSLA": "hardware",
}
DEFAULT_CATEGORY = "other"


def category_for_ticker(ticker: str) -> str:
    """ティッカーのカテゴリキーを返す（大文字化＋サフィックス除去で照合）。無ければ DEFAULT_CATEGORY。"""
    if not ticker:
        return DEFAULT_CATEGORY
    for c in (ticker, ticker.upper(), ticker.upper().split(".")[0]):
        cat = TICKER_CATEGORY.get(c)
        if cat:
            return cat
    return DEFAULT_CATEGORY


# --- 純粋なXBRL正規化（ネットワーク非依存・テスト対象） ----------------------

def _days_between(start: str, end: str) -> Optional[int]:
    try:
        s = dt.date.fromisoformat(str(start)[:10])
        e = dt.date.fromisoformat(str(end)[:10])
        return (e - s).days
    except (ValueError, TypeError):
        return None


def normalize_annual_facts(
    units: Optional[Dict[str, Any]],
    *,
    min_days: int = 300,
    max_days: int = 400,
) -> List[Dict[str, Any]]:
    """companyconcept の `units` から「年次フロー値」の時系列を昇順で返す。

    - 年次のみ採用: start〜end の期間が概ね1年(min_days〜max_days日)のもの。期間が無い
      （瞬間値）ファクトは対象外（売上/粗利/R&D/capex は期間フローのため）。
    - 同一会計年度(end の年)に複数ファクト（四半期重複や restatement）がある場合は、
      最新の `filed`（同点なら大きい値）を1点に集約する。
    返り値: [{"year": int, "value": float, "end": "YYYY-MM-DD"}], 年昇順。
    """
    by_year: Dict[int, Dict[str, Any]] = {}
    for _unit_key, vals in (units or {}).items():
        if not isinstance(vals, list):
            continue
        for f in vals:
            if not isinstance(f, dict):
                continue
            end = f.get("end")
            val = f.get("val")
            start = f.get("start")
            if not end or val is None:
                continue
            # 売上/粗利/R&D/capex は期間フロー。start を持たない瞬間値(=残高系)は対象外。
            if not start:
                continue
            d = _days_between(start, end)
            if d is None or d < min_days or d > max_days:
                continue
            try:
                year = int(str(end)[:4])
                fval = float(val)
            except (ValueError, TypeError):
                continue
            filed = str(f.get("filed") or "")
            prev = by_year.get(year)
            if prev is None or (filed, fval) > (prev["filed"], prev["value"]):
                by_year[year] = {"filed": filed, "value": fval, "end": str(end)}
    return [
        {"year": y, "value": by_year[y]["value"], "end": by_year[y]["end"]}
        for y in sorted(by_year)
    ]


def pick_metric_series(
    concept_units: List[Tuple[str, Optional[Dict[str, Any]]]],
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """指標のフォールバック解決。`[(concept_name, units|None), ...]` を優先順に試し、
    最初に年次データが取れた concept とその系列を返す。どれも空なら (None, [])。"""
    for concept_name, units in concept_units:
        if not units:
            continue
        series = normalize_annual_facts(units)
        if series:
            return concept_name, series
    return None, []


# --- データファイルのロード（キャッシュ） -----------------------------------

def load_financial_fundamentals(path: Optional[str] = None) -> Dict[str, Any]:
    """financial-fundamentals.json を読み込みキャッシュする。無ければ空dict。"""
    global _CACHE
    if path is None:
        if _CACHE is not None:
            return _CACHE
        target = _DATA_PATH
    else:
        target = path
    try:
        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}
    except Exception as e:  # pragma: no cover - 防御的
        logger.error(f"financial-fundamentals.json load failed: {e}")
        data = {}
    if path is None:
        _CACHE = data
    return data


def _reset_cache() -> None:
    """テスト用: キャッシュをクリアする。"""
    global _CACHE
    _CACHE = None


def _entry_for_ticker(data: Dict[str, Any], ticker: str) -> Optional[Dict[str, Any]]:
    """ティッカーのエントリを返す（大文字・サフィックス除去で照合）。"""
    if not ticker:
        return None
    for c in (ticker, ticker.upper(), ticker.upper().split(".")[0]):
        entry = data.get(c)
        if isinstance(entry, dict) and entry.get("metrics"):
            return entry
    return None


def build_company_fundamentals(ticker: str) -> Dict[str, Any]:
    """指定ティッカーの財務ファンダメンタルズ年次時系列を返す。

    Returns dict:
        ticker, name, currency, note,
        series: [{key(metric), concept}],  # 値を持つ指標のみ、METRIC_KEYS順
        years:  [int, ...],
        points: [{year, values: {metricKey: value}}],
    """
    data = load_financial_fundamentals()
    entry = _entry_for_ticker(data, ticker)
    note = (
        "米国上場株・SEC EDGAR XBRL 由来の年次フロー（売上/粗利/R&D/capex）。"
        "概念差異はフォールバックで解決。非米国・XBRL未開示は対象外。"
    )
    if not entry:
        return {
            "ticker": ticker.upper(),
            "name": None,
            "currency": "USD",
            "note": note,
            "series": [],
            "years": [],
            "points": [],
        }

    metrics = entry.get("metrics", {}) or {}
    present_keys = [k for k in METRIC_KEYS if (metrics.get(k) or {}).get("points")]

    # 指標ごとの year->value マップ。
    per_metric: Dict[str, Dict[int, float]] = {}
    for k in present_keys:
        yv: Dict[int, float] = {}
        for p in metrics[k].get("points", []):
            year = p.get("year")
            val = p.get("value")
            if year is None or val is None:
                continue
            yv[int(year)] = float(val)
        per_metric[k] = yv

    all_years = sorted({y for yv in per_metric.values() for y in yv})
    series = [{"key": k, "concept": (metrics.get(k) or {}).get("concept")} for k in present_keys]
    points = []
    for year in all_years:
        values = {k: per_metric[k][year] for k in present_keys if year in per_metric[k]}
        if values:
            points.append({"year": year, "values": values})

    return {
        "ticker": (entry.get("ticker") or ticker).upper(),
        "name": entry.get("name"),
        "currency": entry.get("currency", "USD"),
        "note": note,
        "series": series,
        "years": all_years,
        "points": points,
    }


def list_fundamentals_companies() -> List[Dict[str, Any]]:
    """財務時系列データを持つ企業一覧（フロントのセレクタ用）。指標数の多い順 → ティッカー順。"""
    data = load_financial_fundamentals()
    out: List[Dict[str, Any]] = []
    for key, entry in data.items():
        if key == "_meta" or not isinstance(entry, dict):
            continue
        metrics = entry.get("metrics", {}) or {}
        metric_count = sum(1 for k in METRIC_KEYS if (metrics.get(k) or {}).get("points"))
        ticker = (entry.get("ticker") or key).upper()
        out.append({
            "ticker": ticker,
            "name": entry.get("name"),
            "metric_count": metric_count,
            "has_data": metric_count > 0,
            "category": category_for_ticker(ticker),
        })
    out.sort(key=lambda r: (not r["has_data"], -r["metric_count"], str(r["ticker"])))
    return out
