#!/usr/bin/env python3
"""本番(Firestore)向けダッシュボードのコアデータを「同期」で投入するスクリプト (SOT-1391)。

なぜこのスクリプトが必要か:
    本番では `backend/app/main.py` の `_run_prod_seed()` が daemon の
    バックグラウンドスレッドで `seed_dashboard_data_firestore()` 等を呼んでいる。
    しかし Cloud Run の CPU スロットリング/スケールゼロにより、約1万件規模の
    月次論文データ(`paper_monthly_counts`)書き込みが完了前にスレッドごと止まり、
    一部テーマしか月次データが入らない(=モメンタム散布図に数テーマしか出ない)
    という欠落が起きていた。
    本スクリプトはフルCPUのオペレータ環境から「同期で」同じシード処理を実行し、
    全テーマ分の月次データ(および他のコアデータ)を確実に Firestore へ投入する。
    全処理は冪等(upsert)なので、既存データを壊さず不足分を埋められる。

使用方法:
    cd /workspaces/stock-signal-research/backend
    GCP_PROJECT_ID=your-project-id python scripts/seed_firestore_dashboard.py

    # ダッシュボード(月次データ含む)だけを投入したい場合:
    GCP_PROJECT_ID=your-project-id SEED_ONLY=dashboard python scripts/seed_firestore_dashboard.py

注意:
    - GCP_PROJECT_ID を設定してから実行すること
    - Firestore への書き込みには GCP 認証が必要(ADC または GOOGLE_APPLICATION_CREDENTIALS)
    - リポジトリを Firestore 実装にするため APP_ENV を production に強制する
      (local/test だと SQLite になり本番へ投入されない)
"""

import os
import sys
import logging

# backend ディレクトリを sys.path に追加(app パッケージを import するため)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# app の各リポジトリは use_sqlite()(APP_ENV in {local,test})で SQLite/Firestore を切り替える。
# Firestore へ投入させるため、local/test のときだけ production に上書きする(既に production 等が
# 設定済みならそれを尊重する)。app モジュールの import より前に設定する必要がある。
if os.getenv("APP_ENV", "local") in ("local", "test"):
    os.environ["APP_ENV"] = "production"

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _report_monthly_coverage(project_id: str) -> None:
    """投入結果の確認: paper_monthly_counts の distinct theme_id 数と総ドキュメント数をログ出力する。"""
    try:
        from google.cloud import firestore

        database = os.getenv("FIRESTORE_DATABASE", "(default)")
        if database and database != "(default)":
            fs_client = firestore.Client(project=project_id, database=database)
        else:
            fs_client = firestore.Client(project=project_id)

        theme_ids = set()
        total = 0
        for doc in fs_client.collection("paper_monthly_counts").stream():
            total += 1
            tid = (doc.to_dict() or {}).get("theme_id")
            if tid:
                theme_ids.add(tid)
        logger.info(
            "paper_monthly_counts coverage: %d distinct theme_id, %d documents total",
            len(theme_ids),
            total,
        )
    except Exception as e:  # noqa: BLE001 - 確認ログの失敗で投入自体を失敗扱いにしない
        logger.warning("Could not report paper_monthly_counts coverage: %s", e)


def main():
    project_id = os.getenv("GCP_PROJECT_ID")
    if not project_id:
        logger.error("GCP_PROJECT_ID が設定されていません")
        sys.exit(1)

    from app import seed

    seed_only = (os.getenv("SEED_ONLY") or "").strip().lower()

    logger.info(
        "Firestore シード(同期)開始: project=%s, database=%s, SEED_ONLY=%s",
        project_id,
        os.getenv("FIRESTORE_DATABASE", "(default)"),
        seed_only or "(all)",
    )

    # `_run_prod_seed()` と同じ順序。各ステップは独立に try/except で囲み、
    # 一つが失敗しても後続(特に月次データを含む dashboard)を試みる。
    if seed_only == "dashboard":
        steps = [("dashboard", seed.seed_dashboard_data_firestore)]
    else:
        steps = [
            ("research_seeds", seed.seed_research_seeds_firestore),
            ("dashboard", seed.seed_dashboard_data_firestore),
            ("investors", seed.seed_investors_firestore),
            ("patents", seed.seed_patents_firestore),
        ]

    failures = []
    for name, fn in steps:
        try:
            logger.info("seeding %s ...", name)
            fn()
        except Exception as e:  # noqa: BLE001 - 1ステップの失敗で全体を止めない
            logger.exception("seed step '%s' failed: %s", name, e)
            failures.append(name)

    _report_monthly_coverage(project_id)

    if failures:
        logger.error("一部のシードに失敗しました: %s", ", ".join(failures))
        sys.exit(1)
    logger.info("Firestore シード完了")


if __name__ == "__main__":
    main()
