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
    """SOT-900: 旧シードの一律10件/年から年次可変化したため、新件数 < 10 の過去年に残る
    余剰doc(index N〜09)を削除して年ごとの動きを正規化する。"""
    theme, company, paper, supply, trend, score = _wire(monkeypatch)

    seed.seed_dashboard_data_firestore()

    expected_stale = seed._stale_paper_ids([t["name"] for t in seed._DASHBOARD_THEMES])
    # reconcile が想定どおりの余剰idを削除している
    assert paper.deleted == expected_stale
    # 削除対象は新たに投入される論文idとは重複しない（生きたデータを消さない）
    live_ids = {p["pid"] for p in seed._DASHBOARD_PAPERS}
    assert set(paper.deleted).isdisjoint(live_ids)
    # 件数が10件未満になる過去年が存在するため、少なくとも1件は掃除される
    assert len(paper.deleted) > 0


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
