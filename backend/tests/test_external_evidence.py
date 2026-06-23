"""Unit + API tests for structured external evidence expansion (SOT-1123).

Covers (no real network):
- info-type classification (news / announcement / earnings / filing)
- stable info_id generation
- dedup by info_id and normalized URL
- record normalization (info_type / relevance / info_id backfill)
- AlignmentScore reflecting filings (F) while staying backward compatible at F=0
- committed external-evidence.json dataset shape (real data, all 4 types)
- /api/themes/{id}/external-infos returning the new `filings` group
"""
import os
import json

from jobs import collect_external_evidence as cee
from app.services.scoring import calculate_alignment_score


# --------------------------------------------------------------------------- #
# classification
# --------------------------------------------------------------------------- #
def test_classify_info_type_filing_by_source():
    assert cee.classify_info_type("NVIDIA files 10-K", "annual report", "SEC EDGAR") == "filing"


def test_classify_info_type_earnings():
    assert cee.classify_info_type("Micron and its Red-Hot Earnings Charts") == "earnings"
    assert cee.classify_info_type("Broadcom's AI Revenue Triples in a Single Quarter") == "earnings"


def test_classify_info_type_announcement():
    assert cee.classify_info_type("AMD Lands a Massive AI Infrastructure Opportunity") == "announcement"
    assert cee.classify_info_type("KeyBanc Lifts Price Target on Arista Networks") == "announcement"


def test_classify_info_type_news_default():
    assert cee.classify_info_type("Nvidia Takes Its AI Platform Into Geothermal Energy") == "news"


# --------------------------------------------------------------------------- #
# info_id + dedup
# --------------------------------------------------------------------------- #
def test_build_info_id_is_stable_and_prefixed():
    r = {"info_type": "filing", "url": "https://www.sec.gov/x/y.htm"}
    a = cee.build_info_id(r)
    b = cee.build_info_id(dict(r))
    assert a == b
    assert a.startswith("filing-")
    assert cee.build_info_id({"info_type": "news", "url": "https://e/x"}).startswith("news-")


def test_dedupe_records_by_id_and_url():
    records = [
        {"info_id": "a", "url": "https://x.com/a"},
        {"info_id": "a", "url": "https://x.com/a"},          # dup id
        {"info_id": "b", "url": "https://x.com/a?ref=1"},    # dup normalized url
        {"info_id": "c", "url": "https://x.com/c/"},         # unique
    ]
    out = cee.dedupe_records(records)
    ids = [r["info_id"] for r in out]
    assert ids == ["a", "c"]


def test_normalize_record_backfills():
    rec = cee.normalize_record({"title": "Some Co Q3 results", "url": "https://e/n"})
    assert rec["info_type"] == "earnings"
    assert rec["info_id"].startswith("news-")
    assert rec["relevance_score"] == cee.RELEVANCE_BY_TYPE["earnings"]


# --------------------------------------------------------------------------- #
# AlignmentScore reflects filings
# --------------------------------------------------------------------------- #
def test_alignment_score_backward_compatible_when_no_filings():
    # Identical to the legacy 4-arg call (F defaults to 0)
    assert calculate_alignment_score(5, 3, 2, 25.0) == calculate_alignment_score(5, 3, 2, 25.0, F=0)
    assert calculate_alignment_score(5, 0, 0, 0.0)["score"] == 10.5


def test_alignment_score_filings_raise_evidence_and_score():
    base = calculate_alignment_score(2, 0, 0, 10.0, F=0)
    withf = calculate_alignment_score(2, 0, 0, 10.0, F=3)
    # filings count toward evidence
    assert withf["evidence_count"] == base["evidence_count"] + 3
    # filings add a positive bonus and improve diversity
    assert withf["score"] > base["score"]


def test_alignment_score_filing_only_is_modest():
    only = calculate_alignment_score(0, 0, 0, 0.0, F=5)
    assert only["evidence_count"] == 5
    assert 0 < only["score"] <= 15


# --------------------------------------------------------------------------- #
# committed real dataset
# --------------------------------------------------------------------------- #
def test_committed_dataset_is_well_formed():
    path = os.path.join(os.path.dirname(__file__), "..", "data", "external-evidence.json")
    assert os.path.exists(path), "external-evidence.json must be committed"
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)
    items = payload["items"] if isinstance(payload, dict) else payload
    assert len(items) >= 20
    types = set()
    for it in items:
        assert it["info_type"] in cee.VALID_TYPES
        assert it.get("url"), "every evidence item needs an evidence URL"
        assert it.get("published_at"), "every evidence item needs a published date"
        assert it.get("info_id")
        types.add(it["info_type"])
    # all four structured types present, including SEC filing
    assert {"news", "filing"}.issubset(types)


def test_load_committed_dataset_normalizes():
    items = cee.load_committed_dataset()
    assert items, "dataset should load"
    assert all(i["info_type"] in cee.VALID_TYPES for i in items)
    # dedup is stable on the committed set
    assert len(cee.dedupe_records(list(items))) == len(items)


# --------------------------------------------------------------------------- #
# API: filings group is exposed
# --------------------------------------------------------------------------- #
def test_theme_external_infos_includes_filings(client):
    theme = client.post("/api/themes/", json={
        "name": "SOT-1123 Filing Theme",
        "category": "Semiconductor",
        "description": "test",
        "precursor_score": 50.0,
    }).json()
    theme_id = theme["id"]

    client.post("/api/external-infos/", json={
        "info_id": "sot1123-test-filing-1",
        "info_type": "filing",
        "title": "TestCo files 10-K",
        "url": "https://www.sec.gov/test/10k.htm",
        "summary": "annual report",
        "source_name": "SEC EDGAR",
        "published_at": "2026-06-20",
        "related_company": "TestCo",
        "theme_id": theme_id,
        "relevance_score": 70.0,
    })

    resp = client.get(f"/api/themes/{theme_id}/external-infos")
    assert resp.status_code == 200
    body = resp.json()
    assert "filings" in body
    assert any(f["info_id"] == "sot1123-test-filing-1" for f in body["filings"])
    # legacy groups still present
    for key in ("news", "announcements", "earnings"):
        assert key in body
