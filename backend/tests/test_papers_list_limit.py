"""SOT-1213: 論文一覧(全カテゴリ・全テーマ)が本番で空表示になる不具合の回帰テスト。

真因は `GET /papers/`(theme_id 未指定)が本番Firestoreの全論文(1万件超)をストリーム取得し
応答が数十秒かかってタイムアウトしていたこと。フィルタなし時は引用数上位 N 件に制限する。
ここでは DB 非依存に SQLite リポジトリの limit 挙動(引用数降順・上限)を固定する。
"""
import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("APP_ENV", "test")

from app.database import Base
from app.models import Paper
from app.repositories.paper_repository import SQLitePaperRepository


@pytest.fixture
def session_factory():
    fd, path = tempfile.mkstemp(suffix=".db")
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    yield factory
    engine.dispose()
    os.close(fd)
    if os.path.exists(path):
        os.unlink(path)


def _seed_papers(factory, rows):
    db = factory()
    try:
        for r in rows:
            db.add(Paper(**r))
        db.commit()
    finally:
        db.close()


def test_list_all_limit_returns_top_cited(session_factory):
    _seed_papers(session_factory, [
        {"id": "a", "paper_id": "a", "title": "A", "citation_count": 5, "theme_id": "t1"},
        {"id": "b", "paper_id": "b", "title": "B", "citation_count": 100, "theme_id": "t1"},
        {"id": "c", "paper_id": "c", "title": "C", "citation_count": 50, "theme_id": "t2"},
        {"id": "d", "paper_id": "d", "title": "D", "citation_count": 1, "theme_id": "t2"},
    ])
    repo = SQLitePaperRepository(session_factory=session_factory)

    # limit を渡すと引用数降順の上位 N 件のみ返る(応答有界化)。
    top2 = repo.list_all(limit=2)
    assert [p["paper_id"] for p in top2] == ["b", "c"]

    # limit 未指定なら従来どおり全件(引用数降順)。
    all_papers = repo.list_all()
    assert [p["paper_id"] for p in all_papers] == ["b", "c", "a", "d"]


def test_list_all_theme_filter_unaffected_by_limit(session_factory):
    _seed_papers(session_factory, [
        {"id": "a", "paper_id": "a", "title": "A", "citation_count": 5, "theme_id": "t1"},
        {"id": "b", "paper_id": "b", "title": "B", "citation_count": 100, "theme_id": "t1"},
        {"id": "c", "paper_id": "c", "title": "C", "citation_count": 50, "theme_id": "t2"},
    ])
    repo = SQLitePaperRepository(session_factory=session_factory)

    # テーマ指定時は該当テーマの全件(少数のため limit なしで取得)。
    t1 = repo.list_all(theme_id="t1")
    assert {p["paper_id"] for p in t1} == {"a", "b"}
