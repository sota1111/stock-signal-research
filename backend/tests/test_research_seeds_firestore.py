"""SOT-824: 本番(Firestore)向け初期リサーチseed投入の検証(オフライン)。

`seed_research_seeds_firestore()` がJSONから全レコードを冪等にFirestore repoへ
投入することを、in-memory fake repo で確認する(実GCP不要)。
"""
import json
import os

from app import seed
from app.repositories import research_seed_repository as rsr


class FakeRepo:
    """ResearchSeedRepository のin-memoryスタブ。"""

    def __init__(self):
        self.saved = []

    def list_all(self):
        return list(self.saved)

    def save(self, seed_data):
        self.saved.append(dict(seed_data))
        return True


def _json_records():
    json_path = os.path.join(
        os.path.dirname(__file__), "..", "data", "initial-research-seeds.json"
    )
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_seed_research_seeds_firestore_inserts_all(monkeypatch):
    fake = FakeRepo()
    monkeypatch.setattr(rsr, "get_research_seed_repository", lambda *a, **k: fake)

    seed.seed_research_seeds_firestore()

    records = _json_records()
    assert len(fake.saved) == len(records)

    # snake_case キーで保存され、list フィールドはnativeのまま
    first = fake.saved[0]
    for key in (
        "seed_id", "source_type", "theme", "related_keywords",
        "summary", "reason_to_track", "confidence", "seed_created_at",
    ):
        assert key in first
    assert isinstance(first["related_keywords"], list)
    saved_ids = {r["seed_id"] for r in fake.saved}
    assert saved_ids == {r["id"] for r in records}


def test_seed_research_seeds_firestore_is_idempotent(monkeypatch):
    fake = FakeRepo()
    monkeypatch.setattr(rsr, "get_research_seed_repository", lambda *a, **k: fake)

    seed.seed_research_seeds_firestore()
    count_after_first = len(fake.saved)
    # 2回目: 既存ありなのでスキップ(冪等)
    seed.seed_research_seeds_firestore()
    assert len(fake.saved) == count_after_first


def test_seed_research_seeds_firestore_never_raises(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("firestore down")

    monkeypatch.setattr(rsr, "get_research_seed_repository", boom)
    # 起動を妨げない: 例外を握りつぶす
    seed.seed_research_seeds_firestore()
