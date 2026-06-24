"""Unit tests for the SEC EDGAR 13F institutional-investor collection logic (SOT-965).

Covers (no real network):
- information-table XML parsing: aggregation per CUSIP, target-CUSIP filtering
- annual filing selection (year-end + latest)
- nearest shares-outstanding lookup
- seed loader fallback (missing / present collected-investors.json)
"""
import io
import json

from scripts import collect_investor_data as ci
from app import seed


INFO_TABLE_XML = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <ns1:infoTable>
    <ns1:nameOfIssuer>NVIDIA CORP</ns1:nameOfIssuer>
    <ns1:cusip>67066G104</ns1:cusip>
    <ns1:value>1000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>10</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>NVIDIA CORP</ns1:nameOfIssuer>
    <ns1:cusip>67066G104</ns1:cusip>
    <ns1:value>500</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>5</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>SOME OTHER CO</ns1:nameOfIssuer>
    <ns1:cusip>999999999</ns1:cusip>
    <ns1:value>9999</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>123</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
</ns1:informationTable>
"""


def test_parse_holdings_aggregates_and_filters(monkeypatch):
    monkeypatch.setattr(ci, "_request", lambda url: io.BytesIO(INFO_TABLE_XML))
    targets = {"67066G104", "595112103"}  # NVDA + MU (CUSIP-set, backward-compatible)
    agg = ci.parse_holdings("http://example/info.xml", targets)

    # NVDA: two rows summed; non-target CUSIP excluded; MU absent -> dropped (zero).
    assert set(agg.keys()) == {"67066G104"}
    assert agg["67066G104"]["shares"] == 15
    assert agg["67066G104"]["value"] == 1500


# SOT-1120: a holding whose CUSIP is NOT in the target list must still match by issuer name.
NAME_MATCH_XML = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <ns1:infoTable>
    <ns1:nameOfIssuer>BROADCOM INC</ns1:nameOfIssuer>
    <ns1:cusip>000000000</ns1:cusip>
    <ns1:value>200</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>20</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>UNRELATED HOLDINGS CORP</ns1:nameOfIssuer>
    <ns1:cusip>111111111</ns1:cusip>
    <ns1:value>99</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>9</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
</ns1:informationTable>
"""


def test_parse_holdings_matches_by_issuer_name(monkeypatch):
    monkeypatch.setattr(ci, "_request", lambda url: io.BytesIO(NAME_MATCH_XML))
    targets = [
        {"name": "Broadcom", "ticker": "AVGO", "cusips": ["11135F101"], "name_kw": "broadcom"},
    ]
    agg = ci.parse_holdings("http://example/info.xml", targets)

    # Matched by nameOfIssuer keyword despite a non-listed CUSIP; unrelated row dropped.
    assert set(agg.keys()) == {"Broadcom"}
    assert agg["Broadcom"]["shares"] == 20
    assert agg["Broadcom"]["value"] == 200


def test_match_company_prefers_cusip_then_name():
    targets = [
        {"name": "NVIDIA", "cusips": ["67066G104"], "name_kw": "nvidia"},
        {"name": "AMD", "cusips": ["007903107"], "name_kw": "advanced micro"},
    ]
    assert ci.match_company("67066G104", "WHATEVER", targets) == "NVIDIA"
    assert ci.match_company("999999999", "Advanced Micro Devices Inc", targets) == "AMD"
    assert ci.match_company("999999999", "Some Other Co", targets) is None


def test_compute_period_changes_quarter_delta_and_pct():
    points = [
        {"report_date": "2022-12-31", "shares": 100},
        {"report_date": "2021-12-31", "shares": 80},   # out of order on purpose
        {"report_date": "2023-12-31", "shares": 90},
    ]
    ci.compute_period_changes(points)

    # Sorted ascending; first period has zero delta/change.
    assert [p["report_date"] for p in points] == ["2021-12-31", "2022-12-31", "2023-12-31"]
    assert points[0]["quarter_delta"] == 0
    assert points[0]["change_pct"] == 0.0
    # 80 -> 100 : +20 shares, +25%
    assert points[1]["quarter_delta"] == 20
    assert points[1]["change_pct"] == 25.0
    # 100 -> 90 : -10 shares, -10%
    assert points[2]["quarter_delta"] == -10
    assert points[2]["change_pct"] == -10.0


def test_select_annual_picks_year_end_and_latest():
    filings = [
        {"accession": "a", "report_date": "2017-12-31"},
        {"accession": "b", "report_date": "2018-06-30"},  # mid-year, not year-end
        {"accession": "c", "report_date": "2018-12-31"},
        {"accession": "d", "report_date": "2024-12-31"},
        {"accession": "e", "report_date": "2025-09-30"},  # latest quarter
    ]
    selected = ci.select_annual(filings, years_back=10)
    dates = [f["report_date"] for f in selected]

    # Year-end snapshots are kept and the most recent (non-year-end) quarter is included.
    assert "2018-12-31" in dates
    assert "2024-12-31" in dates
    assert "2025-09-30" in dates
    # The mid-year 2018-06-30 (neither year-end nor latest) is dropped.
    assert "2018-06-30" not in dates
    # Output is sorted ascending by report date.
    assert dates == sorted(dates)


def test_nearest_shares_outstanding():
    series = [("2020-12-31", 100.0), ("2021-12-31", 200.0), ("2022-12-31", 300.0)]
    assert ci.nearest_shares_outstanding(series, "2021-06-30") == 100.0
    assert ci.nearest_shares_outstanding(series, "2022-12-31") == 300.0
    assert ci.nearest_shares_outstanding(series, "2019-01-01") is None
    assert ci.nearest_shares_outstanding([], "2022-12-31") is None


def test_load_collected_investors_missing(tmp_path):
    assert seed._load_collected_investors(str(tmp_path / "does-not-exist.json")) is None


def test_load_collected_investors_present(tmp_path):
    payload = [
        {
            "investor_name": "Vanguard Group",
            "company_name": "NVIDIA",
            "report_date": "2024-12-31",
            "report_type": "13F",
            "ownership_pct": 8.5,
            "change_pct": 1.2,
            "notes": "保有 10株 / 評価額 $1,500",
        }
    ]
    f = tmp_path / "collected-investors.json"
    f.write_text(json.dumps(payload), encoding="utf-8")

    records = seed._load_collected_investors(str(f))
    assert records is not None
    assert len(records) == 1
    assert records[0]["investor_name"] == "Vanguard Group"
    assert records[0]["company_name"] == "NVIDIA"


# SOT-1201: production seed must RECONCILE (refresh stale Firestore data), not skip-if-any-exist.
class _FakeInvestorRepo:
    """In-memory stand-in for the investor repository (no Firestore)."""

    def __init__(self, preloaded=None):
        self._rows = list(preloaded or [])
        self.delete_all_calls = 0
        self.save_calls = 0

    def list_all(self):
        return list(self._rows)

    def save(self, data):
        self.save_calls += 1
        self._rows.append(dict(data))
        return True

    def delete_all(self):
        n = len(self._rows)
        self._rows = []
        self.delete_all_calls += 1
        return n


_NEW_JSON = [
    {"investor_name": "BlackRock", "company_name": "NVIDIA", "report_date": "2025-12-31", "value_usd": 100},
    {"investor_name": "Goldman Sachs", "company_name": "NVIDIA", "report_date": "2025-12-31", "value_usd": 200},
]


def test_seed_investors_firestore_refreshes_stale_data(monkeypatch):
    # Old production data: only 1 investor, differs from the new 2-investor JSON.
    repo = _FakeInvestorRepo(preloaded=[{"investor_name": "Vanguard Group", "company_id": "company-nvidia"}])
    monkeypatch.setattr(seed, "_load_collected_investors", lambda: list(_NEW_JSON))
    monkeypatch.setattr(seed, "get_investor_repository", lambda *a, **k: repo, raising=False)
    # get_investor_repository is imported inside the function from .repositories.investor_repository
    import app.repositories.investor_repository as inv_repo
    monkeypatch.setattr(inv_repo, "get_investor_repository", lambda *a, **k: repo)

    seed.seed_investors_firestore()

    assert repo.delete_all_calls == 1  # stale data wiped before reseed
    names = {r["investor_name"] for r in repo.list_all()}
    assert names == {"BlackRock", "Goldman Sachs"}
    assert len(repo.list_all()) == 2


def test_seed_investors_firestore_skips_when_current(monkeypatch):
    # Existing data already matches the JSON (same investor set and count) -> no churn.
    current = [
        {"investor_name": "BlackRock", "company_id": "company-nvidia"},
        {"investor_name": "Goldman Sachs", "company_id": "company-nvidia"},
    ]
    repo = _FakeInvestorRepo(preloaded=current)
    monkeypatch.setattr(seed, "_load_collected_investors", lambda: list(_NEW_JSON))
    import app.repositories.investor_repository as inv_repo
    monkeypatch.setattr(inv_repo, "get_investor_repository", lambda *a, **k: repo)

    seed.seed_investors_firestore()

    assert repo.delete_all_calls == 0
    assert repo.save_calls == 0
    assert len(repo.list_all()) == 2
