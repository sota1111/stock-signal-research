"""Unit tests for the arXiv / Semantic Scholar paper collection logic.

Covers:
- arXiv Atom XML parsing (incl. malformed-entry tolerance)
- arXiv fetch with mocked HTTP (no real network, no real sleep)
- Semantic Scholar fetch when API key is absent
- Dedup / idempotent save via the paper repository (keyed by paper_id)
"""
import json

from jobs import collect_papers
from app.repositories.paper_repository import get_paper_repository


ARXIV_NS_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Scaling Laws for AI Infrastructure</title>
    <summary>We study scaling behavior of large models.</summary>
    <published>2024-01-15T00:00:00Z</published>
    <author><name>Alice Researcher</name></author>
    <author><name>Bob Scientist</name></author>
    <arxiv:primary_category term="cs.LG"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2402.54321v2</id>
    <title>High-Bandwidth Memory Survey</title>
    <summary>A survey of HBM technologies.</summary>
    <published>2024-02-20T00:00:00Z</published>
    <author><name>Carol Engineer</name></author>
    <arxiv:primary_category term="cs.AR"/>
  </entry>
</feed>
"""


class _FakeResponse:
    """Minimal stand-in for the object returned by urllib.request.urlopen,
    supporting the context-manager protocol used by collect_papers."""

    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_parse_arxiv_xml_extracts_fields():
    papers = collect_papers._parse_arxiv_xml(ARXIV_NS_XML)

    assert len(papers) == 2
    first = papers[0]
    assert first["paper_id"] == "2401.12345v1"
    assert first["title"] == "Scaling Laws for AI Infrastructure"
    assert first["authors"] == ["Alice Researcher", "Bob Scientist"]
    assert first["published_at"] == "2024-01-15"
    assert first["abstract"] == "We study scaling behavior of large models."
    assert first["url"] == "http://arxiv.org/abs/2401.12345v1"
    assert first["source"] == "arxiv"
    assert first["extracted_keywords"] == ["cs.LG"]


def test_parse_arxiv_xml_skips_malformed_entries():
    malformed = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>No id entry</title>
  </entry>
</feed>
"""
    # An entry without an <id> raises internally and must be skipped, not crash.
    papers = collect_papers._parse_arxiv_xml(malformed)
    assert papers == []


def test_fetch_from_arxiv_with_mocked_http(monkeypatch):
    monkeypatch.setattr(collect_papers, "_get_theme_queries", lambda: ["test query"])
    monkeypatch.setattr(collect_papers.time, "sleep", lambda _s: None)

    def fake_urlopen(url, timeout=None):
        assert "test+query" in url or "test%20query" in url or "test query" in url
        return _FakeResponse(ARXIV_NS_XML)

    monkeypatch.setattr(collect_papers.urllib.request, "urlopen", fake_urlopen)

    papers = collect_papers._fetch_from_arxiv()

    assert len(papers) == 2
    assert {p["source"] for p in papers} == {"arxiv"}
    assert papers[0]["paper_id"] == "2401.12345v1"


def _make_arxiv_xml(ids):
    """Build an arXiv Atom feed with one <entry> per id (for pagination tests)."""
    entries = "".join(
        f"""  <entry>
    <id>http://arxiv.org/abs/{i}</id>
    <title>Paper {i}</title>
    <summary>Abstract for {i}.</summary>
    <published>2020-01-01T00:00:00Z</published>
    <author><name>Author {i}</name></author>
    <arxiv:primary_category term="cs.LG"/>
  </entry>
"""
        for i in ids
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<feed xmlns="http://www.w3.org/2005/Atom"\n'
        '      xmlns:arxiv="http://arxiv.org/schemas/atom">\n'
        + entries
        + "</feed>\n"
    ).encode("utf-8")


def test_fetch_from_arxiv_paginates_until_short_page(monkeypatch):
    # Single (theme, year) window with a per-year target above the page size: a full first
    # page (ARXIV_PAGE_SIZE distinct ids) then a short page (2 ids) must make exactly 2
    # requests and accumulate page_size + 2 deduped papers.
    monkeypatch.setattr(collect_papers, "_get_theme_queries", lambda: ["paging theme"])
    monkeypatch.setattr(
        collect_papers, "_arxiv_year_windows", lambda *a, **k: [(2024, "20240101", "20241231")]
    )
    monkeypatch.setattr(collect_papers, "ARXIV_PER_THEME_PER_YEAR", 500)
    monkeypatch.setattr(collect_papers.time, "sleep", lambda _s: None)
    page_size = collect_papers.ARXIV_PAGE_SIZE
    calls = {"n": 0}

    def fake_urlopen(url, timeout=None):
        import urllib.parse as up

        calls["n"] += 1
        qs = up.parse_qs(up.urlparse(url).query)
        start = int(qs["start"][0])
        if start == 0:
            ids = [f"p{i:04d}" for i in range(page_size)]
        else:
            ids = ["short-1", "short-2"]
        return _FakeResponse(_make_arxiv_xml(ids))

    monkeypatch.setattr(collect_papers.urllib.request, "urlopen", fake_urlopen)

    papers = collect_papers._fetch_from_arxiv()

    assert calls["n"] == 2  # first full page -> continue; second short page -> stop
    assert len(papers) == page_size + 2
    # All accumulated papers are unique (deduped by paper_id).
    assert len({p["paper_id"] for p in papers}) == page_size + 2
    assert {p["source"] for p in papers} == {"arxiv"}


def test_fetch_from_arxiv_dedupes_across_year_windows(monkeypatch):
    # Across many year windows the same 2-entry response must be deduped to 2 papers,
    # never looping forever (each window short-circuits after one short page).
    monkeypatch.setattr(collect_papers, "_get_theme_queries", lambda: ["dup theme"])
    monkeypatch.setattr(collect_papers.time, "sleep", lambda _s: None)

    def fake_urlopen(url, timeout=None):
        return _FakeResponse(ARXIV_NS_XML)  # always the same 2 entries

    monkeypatch.setattr(collect_papers.urllib.request, "urlopen", fake_urlopen)

    papers = collect_papers._fetch_from_arxiv()

    assert len(papers) == 2
    assert {p["paper_id"] for p in papers} == {"2401.12345v1", "2402.54321v2"}


def test_build_arxiv_url_contains_window_and_pagination():
    url = collect_papers._build_arxiv_url("hbm memory", 100, "20200101", "20201231", 100)
    # submittedDate window is applied (encoded or raw).
    assert "submittedDate:[" in url or "submittedDate%3A%5B" in url
    # Pagination start offset is present.
    assert "start=100" in url


def test_arxiv_year_windows_spans_requested_years():
    from datetime import datetime, timezone

    now = datetime(2025, 6, 15, tzinfo=timezone.utc)
    windows = collect_papers._arxiv_year_windows(10, now=now)
    assert len(windows) == 10
    years = [w[0] for w in windows]
    assert years[0] == 2025 and years[-1] == 2016  # newest-first
    assert (2025, "20250101", "20251231") in windows
    assert (2016, "20160101", "20161231") in windows


def test_semantic_scholar_returns_empty_without_api_key(monkeypatch):
    monkeypatch.delenv("SEMANTIC_SCHOLAR_API_KEY", raising=False)
    assert collect_papers._fetch_from_semantic_scholar() == []


def test_semantic_scholar_with_mocked_http(monkeypatch):
    monkeypatch.setenv("SEMANTIC_SCHOLAR_API_KEY", "dummy-key")
    monkeypatch.setattr(collect_papers, "_get_theme_queries", lambda: ["test query"])
    monkeypatch.setattr(collect_papers.time, "sleep", lambda _s: None)

    payload = json.dumps({
        "data": [
            {
                "paperId": "abc123",
                "title": "SS Paper",
                "authors": [{"name": "Dana Author"}],
                "year": 2024,
                "publicationDate": "2024-03-01",
                "abstract": "Semantic Scholar abstract.",
            }
        ]
    }).encode("utf-8")

    def fake_urlopen(req, timeout=None):
        return _FakeResponse(payload)

    monkeypatch.setattr(collect_papers.urllib.request, "urlopen", fake_urlopen)

    papers = collect_papers._fetch_from_semantic_scholar()

    assert len(papers) == 1
    assert papers[0]["paper_id"] == "ss-abc123"
    assert papers[0]["source"] == "semantic_scholar"
    assert papers[0]["published_at"] == "2024-03-01"


def test_save_is_idempotent_dedup_by_paper_id():
    # APP_ENV=test (set in conftest) -> repo uses SQLite against the temp DB whose
    # tables are created by the session-scoped setup_database fixture. The repo
    # manages its own sessions (commit/close), so a unique paper_id keeps this
    # test isolated without relying on the rollback-based `db` fixture.
    repo = get_paper_repository()
    paper = {
        "paper_id": "dedup-unit-0001",
        "title": "Original Title",
        "url": "http://arxiv.org/abs/dedup-unit-0001",
        "authors": ["Author One"],
        "published_at": "2024-01-01",
        "abstract": "first",
        "extracted_keywords": ["k1"],
        "source": "arxiv",
    }

    assert repo.save(paper) is True
    # Second save with an updated title and the SAME paper_id must upsert, not duplicate.
    paper["title"] = "Updated Title"
    paper["abstract"] = "second"
    assert repo.save(paper) is True

    rows = [p for p in repo.list_all() if p["paper_id"] == "dedup-unit-0001"]
    assert len(rows) == 1
    assert rows[0]["title"] == "Updated Title"
    assert rows[0]["abstract"] == "second"
