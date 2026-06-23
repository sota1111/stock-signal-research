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
