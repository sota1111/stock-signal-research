"""統一シグナルレポート生成（SOT-837）の単体・APIテスト。"""

from datetime import datetime, timezone

from app.services.signal_report import generate_signal_report


FIXED_NOW = datetime(2025, 6, 1, tzinfo=timezone.utc)


def _papers():
    return [
        {
            "paper_id": "p1",
            "title": "Solid state battery progress at Toyota",
            "abstract": "A study of solid state battery sulfide electrolyte.",
            "authors": '["Author A"]',
            "extracted_keywords": '["solid state battery", "sulfide electrolyte"]',
            "published_at": "2025-03-01",
        },
        {
            "paper_id": "p2",
            "title": "Sulfide electrolyte advances",
            "abstract": "More on solid state battery sulfide electrolyte.",
            "authors": '["Author B"]',
            "extracted_keywords": ["solid state battery", "sulfide electrolyte"],
            "published_at": "2025-01-10",
        },
        {
            "paper_id": "p3",
            "title": "Early solid state battery review",
            "abstract": "Solid state battery background.",
            "authors": '["Author C"]',
            "extracted_keywords": '["solid state battery"]',
            "published_at": "2024-05-01",
        },
        {
            "paper_id": "p4",
            "title": "Unrelated quantum computing paper",
            "abstract": "Nothing about batteries here.",
            "authors": '["Author D"]',
            "extracted_keywords": '["quantum"]',
            "published_at": "2025-02-01",
        },
    ]


def _companies():
    return [
        {"name": "Toyota", "ticker": "7203"},
        {"name": "GhostCorp", "ticker": "9999"},  # 根拠なし → 除外される想定
    ]


def test_period_defaults_to_last_10_years():
    report = generate_signal_report("solid state battery", _papers(), _companies(), now=FIXED_NOW)
    assert report["period"] == {"from_year": 2016, "to_year": 2025}
    # 10年分すべての年が含まれる（0件の年も）
    years = [row["year"] for row in report["paper_counts_by_year"]]
    assert years == list(range(2016, 2026))


def test_paper_counts_by_year_only_matching_query():
    report = generate_signal_report(
        "solid state battery", _papers(), _companies(),
        from_year=2024, to_year=2025, now=FIXED_NOW,
    )
    counts = {row["year"]: row["count"] for row in report["paper_counts_by_year"]}
    # p1,p2 (2025) と p3 (2024) のみ一致。p4(quantum) は除外。
    assert counts == {2024: 1, 2025: 2}
    assert report["paper_total"] == 3


def test_surging_keywords_growth_rate():
    report = generate_signal_report(
        "solid state battery", _papers(), _companies(),
        from_year=2024, to_year=2025, now=FIXED_NOW,
    )
    kws = {k["keyword"]: k for k in report["surging_keywords"]}
    # sulfide electrolyte: 2025年に2件、2024年0件 → growth_rate = 2.0（新規急増）
    assert "sulfide electrolyte" in kws
    assert kws["sulfide electrolyte"]["count_latest_year"] == 2
    assert kws["sulfide electrolyte"]["growth_rate"] == 2.0
    assert set(kws["sulfide electrolyte"]["related_paper_ids"]) == {"p1", "p2"}


def test_top_companies_only_with_evidence():
    report = generate_signal_report(
        "solid state battery", _papers(), _companies(),
        from_year=2024, to_year=2025, now=FIXED_NOW,
    )
    companies = report["top_companies"]
    names = [c["company"] for c in companies]
    assert names == ["Toyota"]  # GhostCorp は根拠なしで除外
    toyota = companies[0]
    assert toyota["rank"] == 1
    assert toyota["related_paper_count"] == 1  # p1 のみ題名に Toyota
    assert toyota["market_data_available"] is True
    assert toyota["evidence"][0]["paper_id"] == "p1"
    assert "sulfide electrolyte" in toyota["matched_keywords"]


def test_supply_chain_graph_shape():
    report = generate_signal_report(
        "solid state battery", _papers(), _companies(),
        from_year=2024, to_year=2025, now=FIXED_NOW,
    )
    graph = report["supply_chain_graph"]
    node_ids = {n["id"] for n in graph["nodes"]}
    assert "company:toyota" in node_ids
    assert any(n["type"] == "keyword" for n in graph["nodes"])
    # keyword -> company のエッジが evidence 付きで存在
    assert graph["edges"]
    edge = graph["edges"][0]
    assert edge["target"] == "company:toyota"
    assert edge["relation"] == "researched_by_or_related_to"
    assert "p1" in edge["evidence"]


def test_empty_papers_returns_valid_structure():
    report = generate_signal_report("anything", [], [], from_year=2020, to_year=2022, now=FIXED_NOW)
    assert report["paper_total"] == 0
    assert [r["count"] for r in report["paper_counts_by_year"]] == [0, 0, 0]
    assert report["surging_keywords"] == []
    assert report["top_companies"] == []
    assert report["supply_chain_graph"] == {"nodes": [], "edges": []}


# --- API endpoint test ---


def test_signal_report_endpoint(client):
    client.post("/api/papers/", json={
        "paper_id": "api-p1",
        "title": "Solid state battery work by Toyota",
        "abstract": "solid state battery sulfide electrolyte study",
        "authors": '["A"]',
        "extracted_keywords": '["solid state battery", "sulfide electrolyte"]',
        "published_at": "2025-04-01",
        "source": "arxiv",
    })
    client.post("/api/companies/", json={
        "name": "Toyota",
        "ticker": "7203",
        "description": "auto",
        "benefit_score": 50.0,
        "benefit_type": "direct",
    })

    resp = client.get(
        "/api/dashboard/signal-report",
        params={"query": "solid state battery", "from_year": 2024, "to_year": 2025},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "solid state battery"
    assert data["period"] == {"from_year": 2024, "to_year": 2025}
    assert any(row["count"] > 0 for row in data["paper_counts_by_year"])
    assert data["top_companies"][0]["company"] == "Toyota"
    assert "nodes" in data["supply_chain_graph"]
