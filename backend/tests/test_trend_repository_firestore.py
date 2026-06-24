"""SOT-1209: FirestoreTrendRepository.list_monthly_counts の複合インデックス非依存を検証する。

投資候補ページの「ラグ別 相関」「論文 × 株価（正規化）」は、テーマ別の月次系列
`GET /papers/monthly?theme_id=X` に依存する。以前は Firestore で
`where("theme_id","==") + order_by("year_month")` を発行しており、これは複合インデックス
(theme_id ASC, year_month ASC) を要求する。本番に当該インデックスが無いと FAILED_PRECONDITION で
失敗し空配列を返し、両グラフが「相関を算出するデータが不足しています」になっていた。

本テストは、order_by をサポートしない（= 複合インデックス未整備を模した）fake Firestore コレクションを
用い、theme_id 指定時でもリポジトリが year_month 昇順にソート済みの月次系列を返すことを確認する
（実GCP不要・オフライン）。
"""
import sys
import types

from app.repositories.trend_repository import FirestoreTrendRepository


class _FakeDoc:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return dict(self._data)


class _FakeQuery:
    """theme_id 等価フィルタのみを評価する fake。order_by は呼ばれたら失敗させ、
    複合インデックス未整備（=本番障害）を模す。"""

    def __init__(self, docs, theme_id=None):
        self._docs = docs
        self._theme_id = theme_id

    def where(self, field, _op, value):
        assert field == "theme_id"
        return _FakeQuery(self._docs, theme_id=value)

    def order_by(self, *_args, **_kwargs):
        raise AssertionError(
            "order_by must not be used in the theme_id branch (requires a composite index)"
        )

    def limit(self, _n):
        return self

    def stream(self):
        rows = self._docs
        if self._theme_id is not None:
            rows = [d for d in rows if d.get("theme_id") == self._theme_id]
        return [_FakeDoc(d) for d in rows]


class _FakeDB:
    def __init__(self, docs):
        self._docs = docs

    def collection(self, _name):
        return _FakeQuery(self._docs)


def _install_fake_firestore(monkeypatch, docs):
    fake_module = types.ModuleType("firestore_client")
    fake_module.get_db = lambda: _FakeDB(docs)
    monkeypatch.setitem(sys.modules, "firestore_client", fake_module)


def test_list_monthly_counts_theme_id_sorts_in_python_without_composite_index(monkeypatch):
    # わざと year_month 昇順でない順序で投入する。
    docs = [
        {"theme_id": "t1", "keyword": "k", "year_month": "2024-03", "count": 30},
        {"theme_id": "t1", "keyword": "k", "year_month": "2024-01", "count": 10},
        {"theme_id": "t2", "keyword": "k", "year_month": "2024-02", "count": 99},
        {"theme_id": "t1", "keyword": "k", "year_month": "2024-02", "count": 20},
    ]
    _install_fake_firestore(monkeypatch, docs)

    repo = FirestoreTrendRepository()
    result = repo.list_monthly_counts(theme_id="t1", limit=600)

    # t1 のみ・year_month 昇順で返ること（複合インデックス非依存）。
    assert [r["year_month"] for r in result] == ["2024-01", "2024-02", "2024-03"]
    assert [r["count"] for r in result] == [10, 20, 30]
    assert all(r["theme_id"] == "t1" for r in result)


def test_list_monthly_counts_theme_id_applies_limit_after_sort(monkeypatch):
    docs = [
        {"theme_id": "t1", "keyword": "k", "year_month": "2024-03", "count": 3},
        {"theme_id": "t1", "keyword": "k", "year_month": "2024-01", "count": 1},
        {"theme_id": "t1", "keyword": "k", "year_month": "2024-02", "count": 2},
    ]
    _install_fake_firestore(monkeypatch, docs)

    repo = FirestoreTrendRepository()
    result = repo.list_monthly_counts(theme_id="t1", limit=2)

    # ソート後に limit を適用するため、最も古い2ヶ月が返る。
    assert [r["year_month"] for r in result] == ["2024-01", "2024-02"]
