"""SOT-1180: firestore_client.batch_upsert_documents の検証(オフライン・実GCP不要)。

本番(Cloud Run背景スレッド・CPUスロットリング)で数千〜万件の論文/月次カウントを1件ずつ
`.set()` していたため、スケールゼロ前に投入が完了せず前兆検知ページの月次データが空になっていた。
WriteBatch でまとめて投入し、往復回数を約1/500に圧縮する。本テストは全件が merge 書き込みされ、
500件ごとに commit されること、updatedAt が付与されることを fake Firestore で確認する。
"""


class _FakeDocRef:
    def __init__(self, collection, doc_id):
        self.collection = collection
        self.doc_id = doc_id


class _FakeBatch:
    def __init__(self, recorder):
        self._recorder = recorder
        self.ops = []

    def set(self, doc_ref, data, merge=False):
        self.ops.append(("set", doc_ref.doc_id, dict(data), merge))

    def delete(self, doc_ref):
        self.ops.append(("delete", doc_ref.doc_id, None, None))

    def commit(self):
        # commit ごとの op 件数を記録し、書き込み/削除内容を集約する。
        self._recorder["commit_sizes"].append(len(self.ops))
        for op, doc_id, data, merge in self.ops:
            if op == "delete":
                self._recorder["deleted"].append(doc_id)
                self._recorder["written"].pop(doc_id, None)
            else:
                self._recorder["written"][doc_id] = (data, merge)


class _FakeCollection:
    def __init__(self, name):
        self._name = name

    def document(self, doc_id):
        return _FakeDocRef(self._name, doc_id)


class _FakeDB:
    def __init__(self, recorder):
        self._recorder = recorder

    def collection(self, name):
        return _FakeCollection(name)

    def batch(self):
        return _FakeBatch(self._recorder)


def _install_fake_firestore(monkeypatch):
    # batch_upsert_documents は自モジュールの get_db を参照するため、実モジュールの
    # get_db だけを fake DB に差し替える(他は本物のロジックをそのまま検証する)。
    recorder = {"commit_sizes": [], "written": {}, "deleted": []}
    import importlib
    real = importlib.import_module("firestore_client")
    monkeypatch.setattr(real, "get_db", lambda: _FakeDB(recorder))
    return real, recorder


def test_batch_upsert_writes_all_with_merge_and_updatedat(monkeypatch):
    fake_module, recorder = _install_fake_firestore(monkeypatch)
    items = [(f"doc-{i}", {"value": i}) for i in range(5)]

    written = fake_module.batch_upsert_documents("papers", items)

    assert written == 5
    assert len(recorder["written"]) == 5
    for i in range(5):
        data, merge = recorder["written"][f"doc-{i}"]
        assert merge is True
        assert data["value"] == i
        assert "updatedAt" in data  # 冪等な更新時刻が付与される


def test_batch_upsert_commits_in_chunks_of_500(monkeypatch):
    fake_module, recorder = _install_fake_firestore(monkeypatch)
    items = [(f"doc-{i}", {"value": i}) for i in range(1001)]

    written = fake_module.batch_upsert_documents("paper_monthly_counts", items)

    assert written == 1001
    # 1001件 -> 500/500/1 の3コミット(Firestoreバッチ上限500を超えない)
    assert recorder["commit_sizes"] == [500, 500, 1]
    assert len(recorder["written"]) == 1001


def test_batch_upsert_empty_is_noop(monkeypatch):
    fake_module, recorder = _install_fake_firestore(monkeypatch)

    written = fake_module.batch_upsert_documents("papers", [])

    assert written == 0
    assert recorder["commit_sizes"] == []


# --- SOT-1180: batch_delete_documents -------------------------------------------------
# 旧合成doc(約12,000件)の reconcile を1件ずつ削除すると、Cloud Run のCPUスロットリング下で
# 月次書き込みの前段に居座り scale-zero までに月次へ到達できなかった。WriteBatch でまとめて削除する。


def test_batch_delete_removes_all(monkeypatch):
    fake_module, recorder = _install_fake_firestore(monkeypatch)
    doc_ids = [f"doc-{i}" for i in range(5)]

    deleted = fake_module.batch_delete_documents("papers", doc_ids)

    assert deleted == 5
    assert sorted(recorder["deleted"]) == sorted(doc_ids)


def test_batch_delete_commits_in_chunks_of_500(monkeypatch):
    fake_module, recorder = _install_fake_firestore(monkeypatch)
    doc_ids = [f"doc-{i}" for i in range(1001)]

    deleted = fake_module.batch_delete_documents("papers", doc_ids)

    assert deleted == 1001
    # 1001件 -> 500/500/1 の3コミット(Firestoreバッチ上限500を超えない)
    assert recorder["commit_sizes"] == [500, 500, 1]
    assert len(recorder["deleted"]) == 1001


def test_batch_delete_empty_is_noop(monkeypatch):
    fake_module, recorder = _install_fake_firestore(monkeypatch)

    deleted = fake_module.batch_delete_documents("papers", [])

    assert deleted == 0
    assert recorder["commit_sizes"] == []
