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
    def __init__(self, initial=None):
        self._saved = {}
        for item in initial or []:
            self.save(item)

    @property
    def saved(self):
        return list(self._saved.values())

    def list_all(self):
        return list(self.saved)

    def save(self, data):
        self._saved[data["id"]] = dict(data)
        return True


class FakeSaveRepo:
    def __init__(self):
        self._saved = {}
        self.deleted = []

    @property
    def saved(self):
        return list(self._saved.values())

    def _key(self, data):
        return (
            data.get("id")
            or data.get("paper_id")
            or data.get("theme_id")
            or f"{data.get('from_theme_id')}_{data.get('to_theme_id')}"
        )

    def save(self, data):
        self._saved[self._key(data)] = dict(data)
        return True

    def save_many(self, items):
        # SOT-1180: バッチ投入APIをfakeでも提供(逐次saveに委譲)。
        written = 0
        for item in items:
            if self.save(dict(item)):
                written += 1
        return written

    def delete(self, paper_id):
        self.deleted.append(paper_id)
        return True


class FakeTrendRepo:
    def __init__(self):
        self._saved = {}

    @property
    def saved(self):
        return list(self._saved.values())

    def save_monthly_count(self, data):
        key = f"{data['theme_id']}_{data['keyword']}_{data['year_month']}"
        self._saved[key] = dict(data)
        return True

    def save_monthly_counts_many(self, rows):
        # SOT-1180: バッチ投入APIをfakeでも提供(逐次save_monthly_countに委譲)。
        written = 0
        for row in rows:
            if self.save_monthly_count(dict(row)):
                written += 1
        return written


def _wire(monkeypatch, initial_themes=None):
    theme = FakeThemeRepo(initial_themes)
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
    monkeypatch.setattr("firestore_client.delete_document", lambda *a, **k: True)
    return theme, company, paper, supply, trend, score


def test_seed_dashboard_data_firestore_inserts_all(monkeypatch):
    theme, company, paper, supply, trend, score = _wire(monkeypatch)

    seed.seed_dashboard_data_firestore()

    assert len(theme.saved) == len(seed._DASHBOARD_THEMES)
    assert len(company.saved) == len(seed._DASHBOARD_COMPANIES)
    assert len(paper.saved) == len(seed._DASHBOARD_PAPERS)
    assert len(supply.saved) == len(seed._DASHBOARD_SUPPLY_CHAIN)
    assert len(score.saved) == len(seed._DASHBOARD_THEMES)
    expected_counts = (
        len(seed._DASHBOARD_MONTHLY_REAL)
        if seed._DASHBOARD_MONTHLY_REAL
        else sum(len(pm["counts"]) for pm in seed._DASHBOARD_MONTHLY_COUNTS)
    )
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
    first_counts = (
        len(theme.saved),
        len(company.saved),
        len(supply.saved),
        len(score.saved),
        len(paper.saved),
        len(trend.saved),
    )
    seed.seed_dashboard_data_firestore()
    assert (
        len(theme.saved),
        len(company.saved),
        len(supply.saved),
        len(score.saved),
        len(paper.saved),
        len(trend.saved),
    ) == first_counts
    assert {p["paper_id"] for p in paper.saved} == {p["pid"] for p in seed._DASHBOARD_PAPERS}


def test_seed_dashboard_top_ups_from_existing_seven_themes(monkeypatch):
    legacy_themes = [
        {"id": f"theme-{seed._slug(t['name'])}", **t}
        for t in seed._DASHBOARD_THEMES[:7]
    ]
    theme, company, paper, supply, trend, score = _wire(monkeypatch, initial_themes=legacy_themes)

    seed.seed_dashboard_data_firestore()
    seed.seed_dashboard_data_firestore()

    assert len(theme.saved) == len(seed._DASHBOARD_THEMES)
    assert len({t["id"] for t in theme.saved}) == len(seed._DASHBOARD_THEMES)
    assert len(supply.saved) == len(seed._DASHBOARD_SUPPLY_CHAIN)
    assert len({sc["id"] for sc in supply.saved}) == len(seed._DASHBOARD_SUPPLY_CHAIN)


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
