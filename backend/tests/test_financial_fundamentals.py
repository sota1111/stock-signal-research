"""財務ファンダメンタルズ時系列サービスのテスト (SOT-1121 / 候補D)。

XBRL正規化の純関数（年次フロー抽出・restatement 重複排除・concept フォールバック）と、
build_company_fundamentals / list_fundamentals_companies の整形を、注入したデータで検証する。
ネットワークには一切アクセスしない。
"""
import pytest

from app.services import financial_fundamentals as ff


@pytest.fixture(autouse=True)
def _reset_cache():
    ff._reset_cache()
    yield
    ff._reset_cache()


# --- normalize_annual_facts -------------------------------------------------

def test_normalize_keeps_only_annual_periods():
    units = {
        "USD": [
            # 四半期（~90日）は除外
            {"start": "2021-01-01", "end": "2021-03-31", "val": 25, "filed": "2021-04-30"},
            # 年次（~365日）は採用
            {"start": "2021-01-01", "end": "2021-12-31", "val": 100, "filed": "2022-02-01"},
            {"start": "2020-01-01", "end": "2020-12-31", "val": 80, "filed": "2021-02-01"},
        ]
    }
    series = ff.normalize_annual_facts(units)
    assert series == [
        {"year": 2020, "value": 80.0, "end": "2020-12-31"},
        {"year": 2021, "value": 100.0, "end": "2021-12-31"},
    ]


def test_normalize_dedupes_restatement_by_latest_filed():
    units = {
        "USD": [
            # 同一年に2ファクト: 後から提出(filed)された訂正値 110 を採用する
            {"start": "2021-01-01", "end": "2021-12-31", "val": 100, "filed": "2022-02-01"},
            {"start": "2021-01-01", "end": "2021-12-31", "val": 110, "filed": "2023-02-01"},
        ]
    }
    series = ff.normalize_annual_facts(units)
    assert series == [{"year": 2021, "value": 110.0, "end": "2021-12-31"}]


def test_normalize_skips_instant_and_missing_values():
    units = {
        "USD": [
            {"end": "2021-12-31", "val": None, "filed": "2022-02-01"},  # 値なし
            {"end": "2021-12-31", "val": 50, "filed": "2022-02-01"},    # start なし(瞬間値) → 除外
        ]
    }
    assert ff.normalize_annual_facts(units) == []


def test_normalize_empty_or_none_units():
    assert ff.normalize_annual_facts(None) == []
    assert ff.normalize_annual_facts({}) == []


# --- pick_metric_series（concept フォールバック） ----------------------------

def _annual(year, val):
    return {"start": f"{year}-01-01", "end": f"{year}-12-31", "val": val, "filed": f"{year + 1}-02-01"}


def test_pick_metric_series_uses_first_nonempty_concept():
    # 先頭 concept は空(404=None) → 2番目のフォールバック concept を採用する
    concept_units = [
        ("us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", None),
        ("us-gaap:Revenues", {"USD": [_annual(2021, 200)]}),
        ("us-gaap:SalesRevenueNet", {"USD": [_annual(2021, 999)]}),
    ]
    concept, series = ff.pick_metric_series(concept_units)
    assert concept == "us-gaap:Revenues"
    assert series == [{"year": 2021, "value": 200.0, "end": "2021-12-31"}]


def test_pick_metric_series_skips_concept_with_no_annual_data():
    # 先頭 concept は四半期のみ(年次0件) → 次の concept を採用
    concept_units = [
        ("us-gaap:GrossProfit", {"USD": [{"start": "2021-01-01", "end": "2021-03-31", "val": 5, "filed": "2021-04-30"}]}),
        ("us-gaap:GrossProfitFallback", {"USD": [_annual(2021, 60)]}),
    ]
    concept, series = ff.pick_metric_series(concept_units)
    assert concept == "us-gaap:GrossProfitFallback"
    assert series[0]["value"] == 60.0


def test_pick_metric_series_all_empty():
    concept, series = ff.pick_metric_series([("a", None), ("b", {})])
    assert concept is None
    assert series == []


# --- build_company_fundamentals / list_fundamentals_companies ----------------

def _make_data():
    return {
        "AAPL": {
            "ticker": "AAPL",
            "cik": "0000320193",
            "name": "Apple Inc.",
            "currency": "USD",
            "metrics": {
                "revenue": {"concept": "us-gaap:Revenues", "points": [
                    {"year": 2020, "value": 274.0, "end": "2020-09-26"},
                    {"year": 2021, "value": 365.0, "end": "2021-09-25"},
                ]},
                "rnd": {"concept": "us-gaap:ResearchAndDevelopmentExpense", "points": [
                    {"year": 2021, "value": 21.9, "end": "2021-09-25"},
                ]},
                # capex は points 空 → 系列に含めない
                "capex": {"concept": "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", "points": []},
            },
        },
        "NODATA": {"ticker": "NODATA", "name": "No Data Co", "metrics": {}},
    }


def test_build_company_fundamentals_shape():
    ff._CACHE = _make_data()
    res = ff.build_company_fundamentals("aapl")  # 小文字でも照合
    assert res["ticker"] == "AAPL"
    assert res["name"] == "Apple Inc."
    keys = {s["key"] for s in res["series"]}
    assert keys == {"revenue", "rnd"}  # capex は空なので除外
    assert res["years"] == [2020, 2021]
    p2021 = next(p for p in res["points"] if p["year"] == 2021)
    assert p2021["values"]["revenue"] == 365.0
    assert p2021["values"]["rnd"] == 21.9
    # 2020 は rnd 無し → revenue のみ
    p2020 = next(p for p in res["points"] if p["year"] == 2020)
    assert p2020["values"] == {"revenue": 274.0}


def test_build_company_fundamentals_unknown_ticker_is_empty():
    ff._CACHE = _make_data()
    res = ff.build_company_fundamentals("ZZZZ")
    assert res["series"] == []
    assert res["points"] == []
    assert res["ticker"] == "ZZZZ"


def test_list_fundamentals_companies_orders_by_metric_count():
    ff._CACHE = _make_data()
    companies = ff.list_fundamentals_companies()
    by_ticker = {c["ticker"]: c for c in companies}
    assert by_ticker["AAPL"]["has_data"] is True
    assert by_ticker["AAPL"]["metric_count"] == 2  # revenue + rnd（capex空は数えない）
    assert by_ticker["NODATA"]["has_data"] is False
    assert by_ticker["NODATA"]["metric_count"] == 0
    # データありが先頭、_meta は除外される
    assert companies[0]["ticker"] == "AAPL"
    assert all(c["ticker"] != "_META" for c in companies)


def test_list_fundamentals_companies_includes_category():
    """SOT-1208: 各社にカテゴリキーが付与される（未分類は other）。"""
    ff._CACHE = _make_data()
    companies = ff.list_fundamentals_companies()
    by_ticker = {c["ticker"]: c for c in companies}
    assert by_ticker["AAPL"]["category"] == "hardware"  # 既知マッピング
    assert by_ticker["NODATA"]["category"] == "other"   # 未分類はフォールバック


def test_category_for_ticker_normalizes_and_falls_back():
    """SOT-1208: 大文字化・サフィックス除去で照合し、未知は other。"""
    assert ff.category_for_ticker("nvda") == "semiconductor"
    assert ff.category_for_ticker("MSFT") == "software"
    assert ff.category_for_ticker("GOOGL.US") == "internet"
    assert ff.category_for_ticker("ZZZZ") == "other"
    assert ff.category_for_ticker("") == "other"
