import app.main as app_main


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_spa_shell_response_is_revalidated(client, monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><div id=\"root\"></div>", encoding="utf-8")
    monkeypatch.setattr(app_main, "_dist_dir", str(tmp_path))

    response = client.get("/some-spa-route")

    assert response.status_code == 200
    assert "no-cache" in response.headers.get("cache-control", "")

def test_get_themes_empty(client):
    response = client.get("/api/themes/")
    assert response.status_code == 200
    assert response.json() == []

def test_create_and_get_theme(client):
    # Create
    theme_data = {
        "name": "Test Theme",
        "category": "Test Category",
        "description": "Test Description",
        "precursor_score": 50.0,
        "is_trending": True
    }
    response = client.post("/api/themes/", json=theme_data)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Theme"
    assert "id" in data
    
    # List
    response = client.get("/api/themes/")
    assert response.status_code == 200
    themes = response.json()
    assert len(themes) == 1
    assert themes[0]["name"] == "Test Theme"

def test_get_companies(client):
    response = client.get("/api/companies/")
    assert response.status_code == 200
    assert response.json() == []

def test_get_papers(client):
    response = client.get("/api/papers/")
    assert response.status_code == 200
    assert response.json() == []

def test_evaluation_signal_alignment(client):
    # Empty case
    response = client.get("/api/evaluation/signal-alignment")
    assert response.status_code == 200
    data = response.json()
    assert data["baseline"] == "2024-01-01"
    assert data["summary"]["windows"][0]["evaluated_count"] == 0

def test_create_and_get_company(client):
    company_data = {
        "name": "Test Company",
        "ticker": "TEST",
        "description": "Test Desc",
        "benefit_score": 60.0,
        "benefit_type": "direct"
    }
    response = client.post("/api/companies/", json=company_data)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Company"
    assert "id" in data
    
    response = client.get(f"/api/companies/{data['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Test Company"

def test_investors_resolve_company_name_without_per_record_lookup(client, monkeypatch):
    # SOT-1168: /investors/ は企業名を一括取得で解決し、投資家1件ごとの
    # get_by_id (N+1 → Firestore タイムアウト) を行わないこと。
    company = client.post(
        "/api/companies/",
        json={
            "name": "Investee Corp",
            "ticker": "INV",
            "description": "d",
            "benefit_score": 50.0,
            "benefit_type": "direct",
        },
    ).json()

    for name in ("Fund A", "Fund B"):
        res = client.post(
            "/api/investors/",
            json={
                "investor_name": name,
                "company_id": company["id"],
                "ownership_pct": 1.0,
                "change_pct": 0.0,
                "report_date": "2024-12-31",
                "report_type": "13F",
            },
        )
        assert res.status_code == 200

    import app.routers.investors as investors_router

    repo = investors_router.get_company_repository()
    calls = {"get_by_id": 0}
    original_get_by_id = repo.get_by_id

    def counting_get_by_id(company_id):
        calls["get_by_id"] += 1
        return original_get_by_id(company_id)

    monkeypatch.setattr(repo, "get_by_id", counting_get_by_id)
    monkeypatch.setattr(
        investors_router, "get_company_repository", lambda: repo
    )

    response = client.get("/api/investors/")
    assert response.status_code == 200
    investors = response.json()
    assert len(investors) == 2
    assert {i["company_name"] for i in investors} == {"Investee Corp"}
    # 一括取得のため、レコード数に比例した get_by_id 呼び出しは発生しない。
    assert calls["get_by_id"] == 0


def test_dashboard_resolves_theme_names_without_per_record_lookup(client, monkeypatch):
    # SOT-1168: GET /dashboard/ は供給網ハイライト等のテーマ名を一括取得で解決し、
    # レコードごとの theme_repo.get_by_id (N+1 → Firestore タイムアウト) を行わないこと。
    theme_a = client.post(
        "/api/themes/",
        json={
            "name": "Theme A",
            "category": "Cat",
            "description": "d",
            "precursor_score": 80.0,
            "is_trending": True,
        },
    ).json()
    theme_b = client.post(
        "/api/themes/",
        json={
            "name": "Theme B",
            "category": "Cat",
            "description": "d",
            "precursor_score": 70.0,
            "is_trending": True,
        },
    ).json()

    import app.routers.dashboard as dashboard_router

    # 供給網エッジはリポジトリ経由で直接シードする（read 経路の N+1 を検証する目的）。
    dashboard_router.get_supply_chain_repository().save(
        {
            "id": "sc-test-1",
            "from_theme_id": theme_a["id"],
            "to_theme_id": theme_b["id"],
            "relationship": "supplies",
            "order": 0,
            "relation_type": "depends_on",
            "confidence": 0.9,
            "evidence": [],
        }
    )


    repo = dashboard_router.get_theme_repository()
    calls = {"get_by_id": 0}
    original_get_by_id = repo.get_by_id

    def counting_get_by_id(theme_id):
        calls["get_by_id"] += 1
        return original_get_by_id(theme_id)

    monkeypatch.setattr(repo, "get_by_id", counting_get_by_id)
    monkeypatch.setattr(dashboard_router, "get_theme_repository", lambda: repo)

    response = client.get("/api/dashboard/")
    assert response.status_code == 200
    body = response.json()

    highlights = body["supply_chain_highlights"]
    assert len(highlights) == 1
    assert highlights[0]["from_theme_name"] == "Theme A"
    assert highlights[0]["to_theme_name"] == "Theme B"
    # 一括取得(list_all)で解決するため、レコードごとの get_by_id は発生しない。
    assert calls["get_by_id"] == 0


def test_create_and_get_paper(client):
    paper_data = {
        "paper_id": "p001",
        "title": "Test Paper",
        "url": "http://example.com",
        "authors": "Author A",
        "published_at": "2024-01",
        "source": "manual"
    }
    response = client.post("/api/papers/", json=paper_data)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Test Paper"
    
    response = client.get("/api/papers/")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["title"] == "Test Paper"


def test_papers_monthly_endpoint_returns_rows_without_id(client):
    """SOT-1209 regression: /papers/monthly must return 200 for themes that HAVE
    monthly data. The repository builds dicts without an `id` field, so the endpoint
    must NOT require `id` in its response_model (previously it did, causing every
    data-bearing theme to fail response validation with HTTP 500 — the investment
    candidates page then showed 'データが不足しています' forever).

    This exercises the real HTTP path (response_model serialization), which the
    repository-layer tests did not cover. The trend repository reads via SessionLocal
    (committed data), so the row is inserted through SessionLocal and cleaned up after.
    """
    from app.database import SessionLocal
    from app.models import PaperMonthlyCount

    session = SessionLocal()
    try:
        session.add(
            PaperMonthlyCount(
                theme_id="theme-monthly-reg",
                keyword="kw",
                year_month="2024-01",
                count=12,
                prev_month_count=10,
                prev_year_count=8,
                mom_change_pct=0.2,
                yoy_change_pct=0.5,
            )
        )
        session.commit()

        response = client.get("/api/papers/monthly", params={"theme_id": "theme-monthly-reg"})
        assert response.status_code == 200, response.text
        rows = response.json()
        assert len(rows) == 1
        body = rows[0]
        assert body["year_month"] == "2024-01"
        assert body["count"] == 12
        assert body["theme_id"] == "theme-monthly-reg"
    finally:
        session.query(PaperMonthlyCount).filter_by(theme_id="theme-monthly-reg").delete()
        session.commit()
        session.close()
