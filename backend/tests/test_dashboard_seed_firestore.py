"""SOT-845: 本番(Firestore)向けダッシュボード初期データ投入の検証(オフライン)。

`seed_dashboard_data_firestore()` が themes/companies/papers/supply_chains/月次件数/scores を
冪等にFirestore repoへ投入し、相互参照(theme_id)が整合することを in-memory fake repo で確認する
(実GCP不要)。
"""
from app import seed
from app.repositories import (
    theme_repository as tr,
    company_repository as cr,
    paper_repository as pr,
    supply_chain_repository as scr,
    trend_repository as ttr,
    score_repository as sr,
)


class FakeThemeRepo:
    def __init__(self):
        self.saved = []

    def list_all(self):
        return list(self.saved)

    def save(self, data):
        self.saved.append(dict(data))
        return True


class FakeSaveRepo:
    def __init__(self):
        self.saved = []
        self.deleted = []

    def save(self, data):
        self.saved.append(dict(data))
        return True

    def delete(self, paper_id):
        self.deleted.append(paper_id)
        return True


class FakeTrendRepo:
    def __init__(self):
        self.saved = []

    def save_monthly_count(self, data):
        self.saved.append(dict(data))
        return True


def _wire(monkeypatch):
    theme = FakeThemeRepo()
    company = FakeSaveRepo()
    paper = FakeSaveRepo()
    supply = FakeSaveRepo()
    trend = FakeTrendRepo()
    score = FakeSaveRepo()
    monkeypatch.setattr(tr, "get_theme_repository", lambda *a, **k: theme)
    monkeypatch.setattr(cr, "get_company_repository", lambda *a, **k: company)
    monkeypatch.setattr(pr, "get_paper_repository", lambda *a, **k: paper)
    monkeypatch.setattr(scr, "get_supply_chain_repository", lambda *a, **k: supply)
    monkeypatch.setattr(ttr, "get_trend_repository", lambda *a, **k: trend)
    monkeypatch.setattr(sr, "get_score_repository", lambda *a, **k: score)
    return theme, company, paper, supply, trend, score


def test_seed_dashboard_data_firestore_inserts_all(monkeypatch):
    theme, company, paper, supply, trend, score = _wire(monkeypatch)

    seed.seed_dashboard_data_firestore()

    assert len(theme.saved) == len(seed._DASHBOARD_THEMES)
    assert len(company.saved) == len(seed._DASHBOARD_COMPANIES)
    assert len(paper.saved) == len(seed._DASHBOARD_PAPERS)
    assert len(supply.saved) == len(seed._DASHBOARD_SUPPLY_CHAIN)
    assert len(score.saved) == len(seed._DASHBOARD_THEMES)
    expected_counts = sum(len(pm["counts"]) for pm in seed._DASHBOARD_MONTHLY_COUNTS)
    assert len(trend.saved) == expected_counts


def test_seed_dashboard_cross_references_consistent(monkeypatch):
    theme, company, paper, supply, trend, score = _wire(monkeypatch)

    seed.seed_dashboard_data_firestore()

    theme_ids = {t["id"] for t in theme.saved}
    # every paper / supply_chain / monthly count / score references an existing theme id
    for p in paper.saved:
        assert p["theme_id"] in theme_ids
    for sc in supply.saved:
        assert sc["from_theme_id"] in theme_ids
        assert sc["to_theme_id"] in theme_ids
    for mc in trend.saved:
        assert mc["theme_id"] in theme_ids
    for s in score.saved:
        assert s["theme_id"] in theme_ids
    # at least one notable company carries a ticker (drives stock-eval cards)
    assert any(c.get("ticker") for c in company.saved)


def test_seed_dashboard_is_idempotent(monkeypatch):
    theme, company, paper, supply, trend, score = _wire(monkeypatch)

    seed.seed_dashboard_data_firestore()
    # First-seed entities (themes/companies/supply/scores) are guarded: when themes already
    # exist they are NOT re-seeded, so their counts stay constant across runs.
    first_guarded = (len(theme.saved), len(company.saved), len(supply.saved), len(score.saved))
    # 2回目: themesが既存なので first-seed ブロックはスキップ。
    seed.seed_dashboard_data_firestore()
    assert (len(theme.saved), len(company.saved), len(supply.saved), len(score.saved)) == first_guarded
    # Papers / monthly counts are idempotent top-ups that always run so an already-seeded prod
    # Firestore gains the full 10-year dataset on the next deploy. The real repos upsert by
    # paper_id / theme_id+keyword+year_month (the in-memory fake here just appends), so the
    # set of distinct ids stays stable even though the fake re-records them.
    assert {p["paper_id"] for p in paper.saved} == {p["pid"] for p in seed._DASHBOARD_PAPERS}


def test_seed_dashboard_reconciles_stale_legacy_papers(monkeypatch):
    """旧合成シードdocの冪等な掃除を検証する。

    - SOT-909 (実データ使用時 `_USING_REAL_PAPERS`): 本番に残る旧合成doc
      (paper-<slug>-<year>-NN) を全削除し、ダッシュボードを実データのみにする。
    - SOT-900 (合成データ時): 一律10件/年から年次可変化したため、新件数 < 10 の過去年に
      残る余剰doc(index N〜09)だけを削除して年ごとの動きを正規化する。
    """
    theme, company, paper, supply, trend, score = _wire(monkeypatch)

    seed.seed_dashboard_data_firestore()

    names = [t["name"] for t in seed._DASHBOARD_THEMES]
    if seed._USING_REAL_PAPERS:
        expected_stale = seed._legacy_synthetic_paper_ids(names)
    else:
        expected_stale = seed._stale_paper_ids(names)
    # reconcile が想定どおりの旧合成idを削除している
    assert paper.deleted == expected_stale
    # 削除対象は新たに投入される論文idとは重複しない（生きたデータを消さない）
    live_ids = {p["pid"] for p in seed._DASHBOARD_PAPERS}
    assert set(paper.deleted).isdisjoint(live_ids)
    # 少なくとも1件は掃除される
    assert len(paper.deleted) > 0


def test_collected_papers_loader_shape_and_filter():
    """SOT-909: 実データローダ `_load_collected_papers` の形状とテーマフィルタを検証する。

    JSONが存在する環境では、各レコードが seeder の期待する内部形状
    (pid/title/pub/theme/citation/url)を持ち、指定テーマ集合だけに絞られる。
    """
    names = [t["name"] for t in seed._DASHBOARD_THEMES]
    loaded = seed._load_collected_papers(names)
    if not loaded:
        # collected-papers.json が無い環境(オフライン)は合成データへフォールバックする契約。
        assert seed._USING_REAL_PAPERS is False
        return

    valid = set(names)
    for p in loaded:
        assert set(["pid", "title", "pub", "theme", "citation", "url"]).issubset(p.keys())
        assert p["theme"] in valid
        assert isinstance(p["citation"], int)
    # 実データ使用時は _DASHBOARD_PAPERS が実データ(arxiv-id)で構成される
    assert seed._USING_REAL_PAPERS is True
    assert all(p["pid"].startswith("arxiv-") for p in seed._DASHBOARD_PAPERS)


def test_stale_paper_ids_match_legacy_indices():
    """各テーマ×年の余剰idは index [N, 10) に対応し、現行件数 N 以上は対象外。"""
    names = [t["name"] for t in seed._DASHBOARD_THEMES]
    from_year, to_year = seed._DECADE_FROM_YEAR, seed._DECADE_TO_YEAR
    stale = set(seed._stale_paper_ids(names, from_year, to_year))
    for name in names:
        slug = seed._slug(name)
        for year in range(from_year, to_year + 1):
            n = seed._papers_in_year(name, year, from_year, to_year)
            # index < N は生きているので stale に含まれない
            if n >= 1:
                assert f"paper-{slug}-{year}-00" not in stale
            # index in [N, 10) は stale
            for idx in range(n, seed._LEGACY_PAPERS_PER_YEAR):
                assert f"paper-{slug}-{year}-{idx:02d}" in stale


def test_seed_dashboard_never_raises(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("firestore down")

    monkeypatch.setattr(tr, "get_theme_repository", boom)
    # 起動を妨げない: 例外を握りつぶす
    seed.seed_dashboard_data_firestore()
