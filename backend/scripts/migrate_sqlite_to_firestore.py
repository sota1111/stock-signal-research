#!/usr/bin/env python3
"""
SQLite サンプルデータを Firestore へ初期投入するスクリプト。

使用方法:
    cd /workspaces/stock-signal-research/backend
    APP_ENV=local GCP_PROJECT_ID=your-project-id python scripts/migrate_sqlite_to_firestore.py

注意:
    - APP_ENV=local で実行（SQLite から読み込むため）
    - GCP_PROJECT_ID を設定してから実行すること
    - Firestore への書き込みには GCP 認証が必要（ADC または GOOGLE_APPLICATION_CREDENTIALS）
"""

import os
import sys
import logging
from datetime import datetime, timezone

# backend ディレクトリを sys.path に追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def migrate_themes(sqlite_db, fs_client):
    from app.models import Theme
    themes = sqlite_db.query(Theme).all()
    collection = fs_client.collection("themes")
    count = 0
    for t in themes:
        data = {
            "id": t.id,
            "name": t.name,
            "category": t.category,
            "description": t.description,
            "precursor_score": t.precursor_score or 0.0,
            "is_trending": t.is_trending or False,
            "updatedAt": datetime.now(timezone.utc),
        }
        collection.document(t.id).set(data, merge=True)
        count += 1
    logger.info(f"themes: {count} documents written to Firestore")


def migrate_companies(sqlite_db, fs_client):
    from app.models import Company
    companies = sqlite_db.query(Company).all()
    collection = fs_client.collection("companies")
    count = 0
    for c in companies:
        data = {
            "id": c.id,
            "name": c.name,
            "ticker": c.ticker,
            "description": c.description,
            "benefit_score": c.benefit_score or 0.0,
            "benefit_type": c.benefit_type or "indirect",
            "theme_ids": c.theme_ids,
            "updatedAt": datetime.now(timezone.utc),
        }
        collection.document(c.id).set(data, merge=True)
        count += 1
    logger.info(f"companies: {count} documents written to Firestore")


def migrate_papers(sqlite_db, fs_client):
    from app.models import Paper
    papers = sqlite_db.query(Paper).all()
    collection = fs_client.collection("papers")
    count = 0
    for p in papers:
        doc_id = p.paper_id.replace("/", "_")
        data = {
            "paper_id": p.paper_id,
            "title": p.title,
            "url": p.url,
            "authors": p.authors,
            "published_at": p.published_at,
            "abstract": p.abstract,
            "extracted_keywords": p.extracted_keywords,
            "source": p.source or "manual",
            "updatedAt": datetime.now(timezone.utc),
        }
        collection.document(doc_id).set(data, merge=True)
        count += 1
    logger.info(f"papers: {count} documents written to Firestore")


def migrate_news(sqlite_db, fs_client):
    from app.models import ExternalInfo
    infos = sqlite_db.query(ExternalInfo).all()
    collection = fs_client.collection("news")
    count = 0
    for info in infos:
        doc_id = info.info_id.replace("/", "_")
        data = {
            "info_id": info.info_id,
            "info_type": info.info_type,
            "title": info.title,
            "url": info.url,
            "summary": info.summary,
            "source_name": info.source_name,
            "published_at": info.published_at,
            "related_company": info.related_company,
            "relevance_score": info.relevance_score or 0.0,
            "updatedAt": datetime.now(timezone.utc),
        }
        collection.document(doc_id).set(data, merge=True)
        count += 1
    logger.info(f"news: {count} documents written to Firestore")


def migrate_supply_chains(sqlite_db, fs_client):
    from app.models import SupplyChain
    chains = sqlite_db.query(SupplyChain).all()
    collection = fs_client.collection("supply_chains")
    count = 0
    for sc in chains:
        doc_id = f"{sc.from_theme_id}_{sc.to_theme_id}"
        data = {
            "id": sc.id,
            "from_theme_id": sc.from_theme_id,
            "to_theme_id": sc.to_theme_id,
            "relationship": sc.relationship,
            "description": sc.description,
            "order": sc.order or 0,
            "updatedAt": datetime.now(timezone.utc),
        }
        collection.document(doc_id).set(data, merge=True)
        count += 1
    logger.info(f"supply_chains: {count} documents written to Firestore")


def migrate_investors(sqlite_db, fs_client):
    from app.models import InstitutionalInvestor
    investors = sqlite_db.query(InstitutionalInvestor).all()
    collection = fs_client.collection("institutional_investors")
    count = 0
    for inv in investors:
        safe_name = inv.investor_name.replace("/", "_").replace(" ", "_")
        doc_id = f"{safe_name}_{inv.company_id}_{inv.report_date or 'nodate'}"
        data = {
            "id": inv.id,
            "investor_name": inv.investor_name,
            "company_id": inv.company_id,
            "ownership_pct": inv.ownership_pct or 0.0,
            "change_pct": inv.change_pct or 0.0,
            "report_date": inv.report_date,
            "report_type": inv.report_type,
            "notes": inv.notes,
            "updatedAt": datetime.now(timezone.utc),
        }
        collection.document(doc_id).set(data, merge=True)
        count += 1
    logger.info(f"institutional_investors: {count} documents written to Firestore")


def migrate_scores(sqlite_db, fs_client):
    from app.models import AlignmentScore
    scores = sqlite_db.query(AlignmentScore).all()
    collection = fs_client.collection("scores")
    count = 0
    for s in scores:
        data = {
            "theme_id": s.theme_id,
            "score": s.score or 0.0,
            "news_score": s.news_score or 0.0,
            "announcement_score": s.announcement_score or 0.0,
            "earnings_score": s.earnings_score or 0.0,
            "confidence": s.confidence or 0.0,
            "evidence_count": s.evidence_count or 0,
            "calculated_at": s.calculated_at.isoformat() if s.calculated_at else None,
            "updatedAt": datetime.now(timezone.utc),
        }
        collection.document(s.theme_id).set(data, merge=True)
        count += 1
    logger.info(f"scores: {count} documents written to Firestore")


def main():
    project_id = os.getenv("GCP_PROJECT_ID")
    if not project_id:
        logger.error("GCP_PROJECT_ID が設定されていません")
        sys.exit(1)

    # SQLite DB を読み込む
    from app.database import SessionLocal, engine, Base
    from app import seed
    Base.metadata.create_all(bind=engine)
    seed.run_seed()
    sqlite_db = SessionLocal()

    # Firestore クライアント初期化
    from google.cloud import firestore
    database = os.getenv("FIRESTORE_DATABASE", "(default)")
    if database and database != "(default)":
        fs_client = firestore.Client(project=project_id, database=database)
    else:
        fs_client = firestore.Client(project=project_id)

    logger.info(f"Firestore に移行開始: project={project_id}, database={database}")

    try:
        migrate_themes(sqlite_db, fs_client)
        migrate_companies(sqlite_db, fs_client)
        migrate_papers(sqlite_db, fs_client)
        migrate_news(sqlite_db, fs_client)
        migrate_supply_chains(sqlite_db, fs_client)
        migrate_investors(sqlite_db, fs_client)
        migrate_scores(sqlite_db, fs_client)
        logger.info("移行完了")
    except Exception as e:
        logger.error(f"移行エラー: {e}")
        sys.exit(1)
    finally:
        sqlite_db.close()


if __name__ == "__main__":
    main()
