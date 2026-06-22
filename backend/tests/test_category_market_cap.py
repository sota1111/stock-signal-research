"""カテゴリ別 真の歴史的時価総額サービスのテスト (SOT-1056 / 子SOT-1065)。

build_category_market_cap の ever-top-N 和集合・系列順・欠損ティッカー処理・空テーマ、
および list_categories の has_market_cap 判定を、フェイクのリポジトリと注入した履歴で検証する。
"""
import pytest

from app.services import market_cap_history as mch


class FakeThemeRepo:
    def __init__(self, themes):
        self._themes = {t["id"]: t for t in themes}

    def get_by_id(self, theme_id):
        return self._themes.get(theme_id)

    def list_all(self):
        return list(self._themes.values())


class FakeCompanyRepo:
    def __init__(self, companies):
        self._companies = companies

    def list_all(self):
        return list(self._companies)


@pytest.fixture(autouse=True)
def _reset_cache():
    mch._reset_cache()
    yield
    mch._reset_cache()


def _slug_id(name):
    return f"theme-{mch._slug(name)}"


def _make_history():
    # 11社: AAA が一貫トップ、KKK は最終年だけ急騰して top10 入り、ZZZ は常に最下位で top10 外。
    hist = {}
    # 10 stable companies AAA..JJJ with descending mcap
    base = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ"]
    for i, t in enumerate(base):
        val_2020 = (10 - i) * 1e11
        val_2021 = (10 - i) * 1.1e11
        hist[t] = {
            "cik": f"000{i}",
            "name": f"{t} Corp",
            "mcap_yearly": [
                {"year": 2020, "market_cap": val_2020, "close": 1.0, "shares": val_2020},
                {"year": 2021, "market_cap": val_2021, "close": 1.0, "shares": val_2021},
            ],
        }
    # KKK: tiny in 2020 (rank 11, out), huge in 2021 (rank 1, in) -> ever-top10 union should include it
    hist["KKK"] = {
        "cik": "0011",
        "name": "KKK Corp",
        "mcap_yearly": [
            {"year": 2020, "market_cap": 1e9, "close": 1.0, "shares": 1e9},
            {"year": 2021, "market_cap": 5e12, "close": 1.0, "shares": 5e12},
        ],
    }
    # ZZZ: always smallest -> never top10
    hist["ZZZ"] = {
        "cik": "0099",
        "name": "ZZZ Corp",
        "mcap_yearly": [
            {"year": 2020, "market_cap": 1e8, "close": 1.0, "shares": 1e8},
            {"year": 2021, "market_cap": 1e8, "close": 1.0, "shares": 1e8},
        ],
    }
    return hist


def _theme_companies(tickers, theme_name):
    import json
    sid = _slug_id(theme_name)
    return [
        {"name": f"{t} Corp", "ticker": t, "theme_ids": json.dumps([sid])}
        for t in tickers
    ]


def test_ever_top_n_union_includes_late_riser_excludes_perennial_bottom():
    mch._CACHE = _make_history()
    theme_name = "AI Compute"
    theme_repo = FakeThemeRepo([{"id": "uuid-1", "name": theme_name, "category": "AI"}])
    members = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ", "KKK", "ZZZ"]
    company_repo = FakeCompanyRepo(_theme_companies(members, theme_name))

    res = mch.build_category_market_cap("uuid-1", theme_repo, company_repo, top_n=10)
    keys = {s["key"] for s in res["series"]}

    # KKK は2021に1位 → 和集合に含まれる。ZZZ は常に圏外 → 除外。
    assert "KKK" in keys
    assert "ZZZ" not in keys
    # 2020 top10(AAA..JJJ) と 2021 top10(KKK,AAA..III) の和集合 = AAA..JJJ + KKK = 11社
    assert len(keys) == 11
    assert res["years"] == [2020, 2021]
    # 系列は直近年(2021)の時価総額降順 → KKK(5e12)が先頭
    assert res["series"][0]["key"] == "KKK"


def test_points_shape_and_values_are_real_history():
    mch._CACHE = _make_history()
    theme_name = "AI Compute"
    theme_repo = FakeThemeRepo([{"id": "uuid-1", "name": theme_name, "category": "AI"}])
    company_repo = FakeCompanyRepo(_theme_companies(["AAA", "KKK"], theme_name))

    res = mch.build_category_market_cap("uuid-1", theme_repo, company_repo, top_n=10)
    p2021 = next(p for p in res["points"] if p["year"] == 2021)
    # 真の履歴値そのまま（近似ではない）
    assert p2021["values"]["KKK"] == 5e12
    assert p2021["values"]["AAA"] == 10 * 1.1e11


def test_missing_ticker_history_is_skipped():
    mch._CACHE = _make_history()
    theme_name = "AI Compute"
    theme_repo = FakeThemeRepo([{"id": "uuid-1", "name": theme_name, "category": "AI"}])
    # NOHIST は履歴に無い → 無視される
    company_repo = FakeCompanyRepo(_theme_companies(["AAA", "NOHIST"], theme_name))

    res = mch.build_category_market_cap("uuid-1", theme_repo, company_repo, top_n=10)
    keys = {s["key"] for s in res["series"]}
    assert keys == {"AAA"}


def test_empty_when_theme_has_no_history_companies():
    mch._CACHE = _make_history()
    theme_name = "Empty Theme"
    theme_repo = FakeThemeRepo([{"id": "uuid-2", "name": theme_name, "category": "X"}])
    company_repo = FakeCompanyRepo(_theme_companies(["NOHIST"], theme_name))

    res = mch.build_category_market_cap("uuid-2", theme_repo, company_repo, top_n=10)
    assert res["series"] == []
    assert res["points"] == []
    assert res["theme_name"] == theme_name


def test_list_categories_flags_market_cap_availability():
    mch._CACHE = _make_history()
    t1 = {"id": "uuid-1", "name": "AI Compute", "category": "AI"}
    t2 = {"id": "uuid-2", "name": "Empty Theme", "category": "X"}
    theme_repo = FakeThemeRepo([t1, t2])
    companies = (
        _theme_companies(["AAA", "BBB"], "AI Compute")
        + _theme_companies(["NOHIST"], "Empty Theme")
    )
    company_repo = FakeCompanyRepo(companies)

    cats = mch.list_categories(theme_repo, company_repo)
    by_id = {c["theme_id"]: c for c in cats}
    assert by_id["uuid-1"]["has_market_cap"] is True
    assert by_id["uuid-1"]["company_count"] == 2
    assert by_id["uuid-2"]["has_market_cap"] is False
    # 履歴ありが先頭に来る
    assert cats[0]["theme_id"] == "uuid-1"
