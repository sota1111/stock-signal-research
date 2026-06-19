#!/usr/bin/env python3
"""投資前兆ダッシュボード用の統一シグナルレポートJSONをファイル出力するCLI（SOT-837）。

既存DB（local: SQLite / production: Firestore）の論文・企業辞書から、本Issue指定形状の
統一JSONを集計して標準出力またはファイルへ書き出す。外部APIキーは不要。

使用方法:
    cd /workspaces/stock-signal-research/backend
    APP_ENV=local python scripts/generate_signal_report.py --query "solid state battery"
    APP_ENV=local python scripts/generate_signal_report.py --query "AI infrastructure" \
        --from-year 2016 --to-year 2025 --out data/signal_report.json
"""

import os
import sys
import json
import argparse

# backend ディレクトリを sys.path に追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.repositories.paper_repository import get_paper_repository  # noqa: E402
from app.repositories.company_repository import get_company_repository  # noqa: E402
from app.services.signal_report import generate_signal_report  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="統一シグナルレポートJSONを生成する")
    parser.add_argument("--query", required=True, help="集計対象テーマ/キーワード")
    parser.add_argument("--from-year", type=int, default=None, help="集計開始年（未指定で直近10年）")
    parser.add_argument("--to-year", type=int, default=None, help="集計終了年（未指定で現在年）")
    parser.add_argument("--top-n", type=int, default=5, help="注目企業の最大件数")
    parser.add_argument("--surge-top-n", type=int, default=10, help="急増キーワードの最大件数")
    parser.add_argument("--out", default=None, help="出力先JSONファイル（未指定なら標準出力）")
    args = parser.parse_args()

    papers = get_paper_repository().list_all()
    companies = get_company_repository().list_all()

    report = generate_signal_report(
        query=args.query,
        papers=papers,
        companies=companies,
        from_year=args.from_year,
        to_year=args.to_year,
        top_n=args.top_n,
        surge_top_n=args.surge_top_n,
    )

    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
        print(f"Wrote signal report to {args.out} (papers matched: {report['paper_total']})")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
