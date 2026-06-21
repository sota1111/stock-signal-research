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
    targets = {"67066G104", "595112103"}  # NVDA + MU
    agg = ci.parse_holdings("http://example/info.xml", targets)

    # NVDA: two rows summed; non-target CUSIP excluded; MU absent -> dropped (zero).
    assert set(agg.keys()) == {"67066G104"}
    assert agg["67066G104"]["shares"] == 15
    assert agg["67066G104"]["value"] == 1500


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
