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
