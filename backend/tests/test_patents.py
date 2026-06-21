"""Tests for the patent pipeline (SOT-960).

Covers (no real network):
- collection script pure helpers: `_field_restrict`, `_normalize` (year filter, tag strip)
- seed loader fallback for missing collected-patents.json
- SQLite patent repository: save/list + yearly counts (idempotent upsert)
- patents API endpoints return 200
"""
from app.database import SessionLocal
from app.models import Theme
from app.repositories.patent_repository import SQLitePatentRepository
from app import seed
from scripts import collect_dashboard_patents as cdp


def test_field_restrict_wraps_title_and_abstract():
    q = cdp._field_restrict('"high bandwidth memory"')
    assert ".ti." in q and ".ab." in q
    assert q.count('"high bandwidth memory"') == 2


def test_normalize_filters_pre_2000_and_strips_tags():
    raw_old = {
        "publicationReferenceDocumentNumber": "6000000",
        "inventionTitle": "Old patent",
        "datePublished": "1999-05-01T00:00:00Z",
    }
    assert cdp._normalize(raw_old, "HBM") is None

    raw = {
        "publicationReferenceDocumentNumber": "11830534",
        "inventionTitle": 'Memory <span term="high">system</span>',
        "datePublished": "2023-11-28T00:00:00Z",
        "assigneeName": ["ACME Corp"],
        "cpcInventiveFlattened": "G11C7/10;G11C5/02",
        "type": "USPAT",
    }
    rec = cdp._normalize(raw, "HBM")
    assert rec is not None
    assert "<span" not in rec["title"] and rec["title"] == "Memory system"
    assert rec["published_at"] == "2023-11-28"
    assert rec["assignee"] == "ACME Corp"
    assert rec["cpc"] == "G11C7/10"  # only first CPC kept
    assert rec["theme"] == "HBM"
    assert rec["patent_id"].startswith("ppubs-")


def test_load_collected_patents_missing_returns_none(tmp_path):
    assert seed._load_collected_patents(str(tmp_path / "nope.json")) is None


def test_sqlite_patent_repository_save_list_and_yearly():
    repo = SQLitePatentRepository(session_factory=SessionLocal)
    # Ensure a theme exists to resolve theme_id by name.
    db = SessionLocal()
    try:
        theme = db.query(Theme).filter(Theme.name == "PatentTestTheme").first()
        if not theme:
            theme = Theme(id="theme-patent-test", name="PatentTestTheme", category="Test")
            db.add(theme)
            db.commit()
        theme_id = theme.id
    finally:
        db.close()

    assert repo.save({
        "patent_id": "ppubs-test-1",
        "patent_number": "11830534",
        "title": "Test patent",
        "published_at": "2023-01-01",
        "theme": "PatentTestTheme",
        "assignee": "ACME",
        "source": "ppubs",
    })
    # Idempotent re-save (update path).
    assert repo.save({"patent_id": "ppubs-test-1", "title": "Test patent v2", "theme": "PatentTestTheme"})

    rows = repo.list_all(theme_id=theme_id)
    assert any(r["patent_id"] == "ppubs-test-1" and r["title"] == "Test patent v2" for r in rows)

    assert repo.save_yearly_count({"theme_id": theme_id, "year": "2023", "count": 42})
    assert repo.save_yearly_count({"theme_id": theme_id, "year": "2023", "count": 99})  # upsert
    yearly = repo.list_yearly_counts(theme_id=theme_id)
    assert {"theme_id": theme_id, "year": "2023", "count": 99} in yearly


def test_patents_api_endpoints(client):
    assert client.get("/api/patents/").status_code == 200
    assert isinstance(client.get("/api/patents/").json(), list)
    assert client.get("/api/patents/yearly").status_code == 200
    assert client.get("/api/patents/top-assignees").status_code == 200
    assert isinstance(client.get("/api/patents/top-assignees").json(), list)
