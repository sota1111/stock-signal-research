from datetime import datetime as _datetime, timezone as _timezone

from .database import SessionLocal
from . import models


def run_seed():
    db = SessionLocal()
    try:
        if db.query(models.Theme).first() is not None:
            return

        # 1. Themes — SQLite/local も Firestore と同じ30テーマ(_DASHBOARD_THEMES)を使う。
        themes_data = _DASHBOARD_THEMES
        themes = {}
        for t in themes_data:
            db_theme = models.Theme(**t)
            db.add(db_theme)
            db.flush()  # To get the ID
            themes[t["name"]] = db_theme

        # 2. Companies
        companies_data = [
            {"name": "NVIDIA", "ticker": "NVDA", "benefit_score": 95.0, "benefit_type": "direct"},
            {"name": "AMD", "ticker": "AMD", "benefit_score": 80.0, "benefit_type": "direct"},
            {"name": "TSMC", "ticker": "TSM", "benefit_score": 88.0, "benefit_type": "direct"},
            {"name": "Micron", "ticker": "MU", "benefit_score": 82.0, "benefit_type": "direct"},
            {"name": "Samsung", "ticker": "005930.KS", "benefit_score": 78.0, "benefit_type": "direct"},
            {"name": "SK hynix", "ticker": "000660.KS", "benefit_score": 80.0, "benefit_type": "direct"},
            {"name": "Kioxia", "ticker": None, "benefit_score": 70.0, "benefit_type": "direct"},
            {"name": "SanDisk", "ticker": None, "benefit_score": 65.0, "benefit_type": "direct"},
            {"name": "Tokyo Electron", "ticker": "8035.T", "benefit_score": 72.0, "benefit_type": "indirect"},
            {"name": "Fujikura", "ticker": "5803.T", "benefit_score": 68.0, "benefit_type": "indirect"},
        ]
        companies = {}
        for c in companies_data:
            db_company = models.Company(**c)
            db.add(db_company)
            db.flush()
            companies[c["name"]] = db_company

        # 3. Supply Chain
        sc_data = [
            {"from": "GPU memory bottleneck", "to": "HBM", "rel": "GPU需要 → HBM需要", "order": 1},
            {"from": "HBM", "to": "SSD / NVMe", "rel": "HBM拡張 → NVMe SSD需要増", "order": 2},
            {"from": "SSD / NVMe", "to": "I/O bottleneck", "rel": "SSD普及 → I/Oボトルネック顕在化", "order": 3},
            {"from": "I/O bottleneck", "to": "KV cache offloading", "rel": "I/O制約 → KVキャッシュオフロード技術需要", "order": 4},
            {"from": "GPU memory bottleneck", "to": "data center power", "rel": "GPU増設 → データセンター電力需要", "order": 5},
            {
                "from": "data center power",
                "to": "robotics foundation model",
                "rel": "電力インフラ整備 → ロボティクス基盤モデル展開",
                "order": 6,
            },
        ]
        for sc in sc_data:
            db_sc = models.SupplyChain(
                from_theme_id=themes[sc["from"]].id,
                to_theme_id=themes[sc["to"]].id,
                relationship=sc["rel"],
                order=sc["order"]
            )
            db.add(db_sc)

        # 4. Papers — 実データ(collected-papers.json)があればそれを、無ければ合成データを使う(SOT-909)。
        papers_data = _DASHBOARD_PAPERS
        for p in papers_data:
            theme = themes.get(p["theme"])
            if theme is None:
                continue
            db_paper = models.Paper(
                paper_id=p["pid"],
                title=p["title"],
                url=p.get("url"),
                abstract=p.get("abstract"),
                published_at=p["pub"],
                theme_id=theme.id,
                citation_count=p.get("citation", 0),
                source=p.get("source", "arxiv" if p.get("url") else "manual"),
            )
            db.add(db_paper)

        # 5. PaperMonthlyCount (10 years / 120 months per theme)
        pm_data = [
            {"theme": "GPU memory bottleneck", "keyword": "GPU memory",
                "counts": _decade_monthly_counts(8, 180)},
            {"theme": "HBM", "keyword": "HBM", "counts": _decade_monthly_counts(4, 150)},
            {"theme": "SSD / NVMe", "keyword": "NVMe", "counts": _decade_monthly_counts(15, 120)},
        ]
        for pm in pm_data:
            prev_count = 0
            for i, count in enumerate(pm["counts"]):
                month = _month_str(_DECADE_FROM_YEAR, i)
                mom_change = ((count - prev_count) / prev_count * 100) if prev_count > 0 else 0.0
                db_pm = models.PaperMonthlyCount(
                    theme_id=themes[pm["theme"]].id,
                    keyword=pm["keyword"],
                    year_month=month,
                    count=count,
                    prev_month_count=prev_count,
                    mom_change_pct=mom_change
                )
                db.add(db_pm)
                prev_count = count

        # 6. Institutional Investors — 実データ(SEC EDGAR 13F)優先(SOT-965)。
        # collected-investors.json があれば過去約10年の主要機関投資家保有を投入。無ければ合成3件。
        collected_investors = _load_collected_investors()
        if collected_investors:
            for rec in collected_investors:
                company = companies.get(rec.get("company_name"))
                if not company:
                    continue
                db.add(models.InstitutionalInvestor(
                    investor_name=rec["investor_name"],
                    company_id=company.id,
                    ownership_pct=rec.get("ownership_pct", 0.0),
                    change_pct=rec.get("change_pct", 0.0),
                    report_date=rec.get("report_date"),
                    report_type=rec.get("report_type", "13F"),
                    notes=rec.get("notes"),
                ))
        else:
            investors_data = [
                {
                    "name": "Vanguard Group",
                    "company": "NVIDIA",
                    "pct": 8.5,
                    "chg": 0.3,
                    "date": "2024-09-30",
                    "type": "13F",
                },
                {"name": "BlackRock", "company": "Micron", "pct": 7.2, "chg": 0.8, "date": "2024-09-30", "type": "13F"},
                {"name": "Nomura Asset", "company": "TSMC", "pct": 2.1, "chg": 0.2, "date": "2024-09-30", "type": "大量保有"},
            ]
            for inv in investors_data:
                db_inv = models.InstitutionalInvestor(
                    investor_name=inv["name"],
                    company_id=companies[inv["company"]].id,
                    ownership_pct=inv["pct"],
                    change_pct=inv["chg"],
                    report_date=inv["date"],
                    report_type=inv["type"]
                )
                db.add(db_inv)

        # 7. Stock Prices
        seed_stock_prices(db, companies)

        db.commit()

        # 8. Initial Research Seeds (from past history)
        seed_research_seeds(db)

        # 9. External Infos & Alignment (Conditional)
        seed_external_infos(db)

    finally:
        db.close()


def seed_research_seeds(db):
    """過去履歴から抽出した初期リサーチseedデータを投入する。
    投資助言ではなく、調査・仮説検証用データ。冪等（既存があればスキップ）。"""
    import json
    import logging
    import os
    from . import models

    logger = logging.getLogger(__name__)

    if db.query(models.ResearchSeed).first() is not None:
        return

    json_path = os.path.join(os.path.dirname(__file__), "..", "data", "initial-research-seeds.json")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            records = json.load(f)
    except (OSError, ValueError) as e:
        logger.warning(f"Could not load initial-research-seeds.json: {e}")
        return

    for r in records:
        db.add(models.ResearchSeed(
            seed_id=r["id"],
            source_type=r.get("sourceType"),
            source_reference=r.get("sourceReference"),
            symbol=r.get("symbol"),
            company_name=r.get("companyName"),
            theme=r.get("theme"),
            related_keywords=json.dumps(r.get("relatedKeywords", []), ensure_ascii=False),
            summary=r.get("summary"),
            papers=json.dumps(r.get("papers", []), ensure_ascii=False),
            stock_events=json.dumps(r.get("stockEvents", []), ensure_ascii=False),
            hypothesis=r.get("hypothesis"),
            reason_to_track=r.get("reasonToTrack"),
            confidence=r.get("confidence"),
            seed_created_at=r.get("createdAt"),
            seed_updated_at=r.get("updatedAt"),
        ))
    db.commit()
    logger.info(f"Seeded {len(records)} research seeds")


def _research_seed_json_to_row(r):
    """Map a camelCase JSON record to the snake_case shape the repository reads.
    List fields are kept native (the Firestore repository handles them)."""
    return {
        "seed_id": r["id"],
        "source_type": r.get("sourceType"),
        "source_reference": r.get("sourceReference"),
        "symbol": r.get("symbol"),
        "company_name": r.get("companyName"),
        "theme": r.get("theme"),
        "related_keywords": r.get("relatedKeywords", []),
        "summary": r.get("summary"),
        "papers": r.get("papers", []),
        "stock_events": r.get("stockEvents", []),
        "hypothesis": r.get("hypothesis"),
        "reason_to_track": r.get("reasonToTrack"),
        "confidence": r.get("confidence"),
        "seed_created_at": r.get("createdAt"),
        "seed_updated_at": r.get("updatedAt"),
    }


def seed_research_seeds_firestore():
    """本番(Firestore)向けに初期リサーチseedデータを冪等投入する。
    `seed_research_seeds()` は SQLite (local/test) 専用のため、本番では別途
    Firestore の `research_seeds` コレクションへ投入しないと一覧が空になる。
    調査・仮説検証用データであり投資助言ではない。失敗しても起動を妨げない。"""
    import json
    import logging
    import os

    logger = logging.getLogger(__name__)

    try:
        from .repositories.research_seed_repository import get_research_seed_repository

        repo = get_research_seed_repository()
        # 冪等: 既に投入済みならスキップ
        if repo.list_all():
            return

        json_path = os.path.join(os.path.dirname(__file__), "..", "data", "initial-research-seeds.json")
        with open(json_path, "r", encoding="utf-8") as f:
            records = json.load(f)

        seeded = 0
        for r in records:
            if repo.save(_research_seed_json_to_row(r)):
                seeded += 1
        logger.info(f"Seeded {seeded} research seeds to Firestore")
    except Exception as e:  # noqa: BLE001 - startup must never crash on seeding failure
        logger.warning(f"Could not seed research seeds to Firestore: {e}")


def _load_collected_investors(json_path=None):
    """SOT-965: SEC EDGAR 13F 由来の実機関投資家データを collected-investors.json から読み込む。
    無ければ None を返し、呼び出し側は合成データへフォールバックする。"""
    import json
    import logging
    import os

    logger = logging.getLogger(__name__)
    if json_path is None:
        json_path = os.path.join(os.path.dirname(__file__), "..", "data", "collected-investors.json")
    if not os.path.exists(json_path):
        return None
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            records = json.load(f)
        if records:
            logger.info("Loaded %d real institutional investors from collected-investors.json", len(records))
            return records
        return None
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not load collected-investors.json: {e}")
        return None


def _slug(text: str) -> str:
    """Deterministic id slug from a human name (e.g. 'GPU memory bottleneck' -> 'gpu-memory-bottleneck')."""
    import re
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")


# --- 10-year (decade) data generation -------------------------------------------------
# The dashboard's research charts (B1 paper_counts_by_year, B2 monthly trend, C1 papers vs
# stock) aggregate the last 10 years by each paper's published_at year. Seed data must
# therefore span the full decade, otherwise the charts only show a single year. The helpers
# below build that decade of data deterministically so both the SQLite (run_seed) and the
# Firestore seeders stay aligned.
# Anchor the decade to the current year so the data always fills the dashboard's rolling
# "last 10 years" window (signal_report defaults to from_year = now.year - 9 .. now.year).
_DECADE_TO_YEAR = _datetime.now(_timezone.utc).year
_DECADE_FROM_YEAR = _DECADE_TO_YEAR - 9
_MONTHLY_MONTHS = (_DECADE_TO_YEAR - _DECADE_FROM_YEAR + 1) * 12  # 120 months


def _month_str(base_year: int, idx: int) -> str:
    """Flat month index from base_year to 'YYYY-MM' (idx 0 -> base_year-01)."""
    return f"{base_year + idx // 12}-{idx % 12 + 1:02d}"


def _decade_monthly_counts(start: int, end: int, months: int = _MONTHLY_MONTHS) -> list:
    """Deterministic monthly counts rising linearly from `start` to `end` over `months`."""
    if months <= 1:
        return [end]
    return [round(start + (end - start) * i / (months - 1)) for i in range(months)]


# 1テーマ・1年あたりに生成する論文件数の下限/上限。年次バーに「年ごとの動き」を出すため、
# 件数は年で固定ではなく、過去→現在へ増加する決定的な可変値にする（下限は0件年を作らないため）。
_MIN_PAPERS_PER_YEAR = 3
_MAX_PAPERS_PER_YEAR = 20

# 旧シードは「1テーマ×1年あたり一律10件(index 00〜09)」を投入していた。年次可変化後、
# 件数が10件未満になる過去年では旧データの余剰doc(index N〜09)が本番Firestoreに残り、
# 年次バーが約10件に底上げされて「年ごとの動き」が消える。冪等な突き合わせで余剰を削除する。
_LEGACY_PAPERS_PER_YEAR = 10


def _theme_seed(name: str) -> int:
    """テーマ名から決定的な整数シードを得る（乱数を使わず再現性を保つ）。"""
    return sum(ord(c) for c in str(name))


def _papers_in_year(name: str, year: int, from_year: int, to_year: int) -> int:
    """テーマ×年に対する論文件数を決定的に算出する。

    過去年ほど少なく現在年へ向けて概ね増加し（年ごとの動きが見える）、テーマ毎に
    開始水準・増加幅が異なる。小さな決定的wiggleで一直線になりすぎないようにし、
    [_MIN_PAPERS_PER_YEAR, _MAX_PAPERS_PER_YEAR] にクランプする。
    """
    span = max(to_year - from_year, 1)
    progress = (year - from_year) / span  # 0.0(最古年) .. 1.0(最新年)
    s = _theme_seed(name)
    base = _MIN_PAPERS_PER_YEAR + (s % 4)   # 3..6: テーマ毎の開始水準
    growth = 6 + (s % 7)                     # 6..12: 10年間での増加幅
    wiggle = ((s + year) % 3) - 1            # -1,0,+1: 決定的な微小変動
    count = round(base + growth * progress) + wiggle
    return max(_MIN_PAPERS_PER_YEAR, min(_MAX_PAPERS_PER_YEAR, count))


def _stale_paper_ids(theme_names, from_year: int = _DECADE_FROM_YEAR, to_year: int = _DECADE_TO_YEAR):
    """年次可変化で不要になった旧シードdocの paper_id 一覧を返す（冪等な掃除用）。

    旧シードは各テーマ×年に一律 `_LEGACY_PAPERS_PER_YEAR` 件(index 00〜)を投入していた。
    新件数 N が旧件数より少ない年では index [N, _LEGACY_PAPERS_PER_YEAR) のdocが余剰となるため、
    その paper_id を列挙する。N が旧件数以上の年は余剰なし（空）。
    """
    stale = []
    for name in theme_names:
        slug = _slug(name)
        for year in range(from_year, to_year + 1):
            count = _papers_in_year(name, year, from_year, to_year)
            for n in range(count, _LEGACY_PAPERS_PER_YEAR):
                stale.append(f"paper-{slug}-{year}-{n:02d}")
    return stale


def _decade_papers(theme_names, from_year: int = _DECADE_FROM_YEAR, to_year: int = _DECADE_TO_YEAR):
    """各テーマ × 各年 (10年) に、年で変動する件数の論文を生成する。

    件数は `_papers_in_year()` により過去→現在へ増加（テーマ毎に水準/傾きが異なる）するため、
    `paper_counts_by_year` の年次バーに右肩上がりの「年ごとの動き」が現れる。
    各論文には決定的な `citation`（引用数）を付与する。古い年ほど、また年内では番号が
    小さいものほど引用数が多くなるようにし、引用数降順ソートが意味を持つようにする。
    """
    papers = []
    for name in theme_names:
        slug = _slug(name)
        for year in range(from_year, to_year + 1):
            age = to_year - year  # 0=最新年, 大きいほど古い
            count = _papers_in_year(name, year, from_year, to_year)
            for n in range(count):
                month = (n % 12) + 1  # 年内で月をばらす
                # 古い論文ほど被引用が蓄積し、年内では先頭ほど引用が多い決定的な値。
                citation = (age + 1) * 50 + (count - n) * 5
                papers.append({
                    "pid": f"paper-{slug}-{year}-{n:02d}",
                    "title": f"{name}: research advances and benchmarks ({year}) #{n + 1}",
                    "pub": f"{year}-{month:02d}",
                    "theme": name,
                    "citation": citation,
                })
    return papers


def _load_collected_papers(theme_names=None):
    """SOT-909: 実データ(arXiv / Semantic Scholar 由来)の論文を collected-papers.json から読み込む。

    返り値は合成データ(`_decade_papers`)と同じ内部形状のリスト:
        [{"pid", "title", "pub", "theme", "citation", "url", "source"}]
    ファイルが無い/壊れている場合は空リストを返す(=合成データへフォールバックし、
    オフライン環境やテストでもダッシュボードのチャートが壊れない)。
    `theme_names` を渡すと、その集合に属する論文だけを返す(seeder の theme 解決と整合)。
    """
    import json
    import logging
    import os

    logger = logging.getLogger(__name__)
    json_path = os.path.join(os.path.dirname(__file__), "..", "data", "collected-papers.json")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            records = json.load(f)
    except (OSError, ValueError):
        return []

    valid = set(theme_names) if theme_names else None
    out = []
    for r in records:
        theme = r.get("theme")
        if not r.get("paper_id") or not r.get("title") or not theme:
            continue
        if valid is not None and theme not in valid:
            continue
        out.append({
            "pid": r["paper_id"],
            "title": r["title"],
            "abstract": r.get("abstract") or "",
            "pub": r.get("published_at") or "",
            "theme": theme,
            "citation": int(r.get("citation_count") or 0),
            "url": r.get("url"),
            "source": "arxiv",
        })
    if out:
        logger.info("Loaded %d real collected papers from collected-papers.json", len(out))
    return out


def _legacy_synthetic_paper_ids(theme_names, from_year: int = _DECADE_FROM_YEAR - 2,
                                to_year: int = _DECADE_TO_YEAR):
    """旧合成シードの paper_id を列挙する(実データ移行時の冪等な掃除用)。

    旧シードは各テーマ×年に `paper-<slug>-<year>-NN` (NN=00.._LEGACY_PAPERS_PER_YEAR-1) を投入
    していた。実データへ移行したら本番Firestoreに残る合成docを全削除する。過去デプロイの
    年アンカーのドリフトに備え、範囲を少し広めに取る。
    """
    ids = []
    for name in theme_names:
        slug = _slug(name)
        for year in range(from_year, to_year + 1):
            for n in range(_LEGACY_PAPERS_PER_YEAR):
                ids.append(f"paper-{slug}-{year}-{n:02d}")
    return ids


# Dashboard core data definitions. Mirrors the data used by run_seed() (SQLite) so that
# production Firestore renders the same dashboard. Kept as module-level constants so both
# the SQLite seed intent and the Firestore seeder stay aligned.
# 注目テーマ(30件表示)用のテーマ定義。先頭7件はサプライチェーン/月次トレンドが名前参照
# しているため温存し、AIインフラ・半導体・ロボティクス・電力等のテーマを追加して30件にする。
_DASHBOARD_THEMES = [
    {"name": "SSD / NVMe", "category": "Storage", "precursor_score": 72.0, "is_trending": True},
    {"name": "GPU memory bottleneck", "category": "AI Infrastructure", "precursor_score": 85.0, "is_trending": True},
    {"name": "HBM", "category": "Memory", "precursor_score": 78.0, "is_trending": True},
    {"name": "KV cache offloading", "category": "AI Infrastructure", "precursor_score": 65.0, "is_trending": False},
    {"name": "I/O bottleneck", "category": "AI Infrastructure", "precursor_score": 58.0, "is_trending": False},
    {"name": "data center power", "category": "Infrastructure", "precursor_score": 70.0, "is_trending": True},
    {"name": "robotics foundation model", "category": "Robotics", "precursor_score": 62.0, "is_trending": False},
    {"name": "CXL memory pooling", "category": "Memory", "precursor_score": 68.0, "is_trending": True},
    {"name": "optical interconnect", "category": "Infrastructure", "precursor_score": 60.0, "is_trending": False},
    {"name": "liquid cooling", "category": "Infrastructure", "precursor_score": 64.0, "is_trending": True},
    {"name": "chiplet packaging", "category": "Semiconductor", "precursor_score": 71.0, "is_trending": True},
    {"name": "advanced packaging CoWoS", "category": "Semiconductor", "precursor_score": 75.0, "is_trending": True},
    {"name": "EUV lithography", "category": "Semiconductor", "precursor_score": 69.0, "is_trending": False},
    {"name": "silicon photonics", "category": "Semiconductor", "precursor_score": 57.0, "is_trending": False},
    {"name": "LLM inference optimization", "category": "AI Infrastructure", "precursor_score": 80.0, "is_trending": True},
    {"name": "quantization", "category": "AI Infrastructure", "precursor_score": 66.0, "is_trending": False},
    {"name": "mixture of experts", "category": "AI Infrastructure", "precursor_score": 63.0, "is_trending": False},
    {"name": "retrieval augmented generation", "category": "AI Infrastructure", "precursor_score": 61.0, "is_trending": False},
    {"name": "vector database", "category": "AI Infrastructure", "precursor_score": 59.0, "is_trending": False},
    {"name": "AI accelerator ASIC", "category": "Semiconductor", "precursor_score": 73.0, "is_trending": True},
    {"name": "neuromorphic computing", "category": "Semiconductor", "precursor_score": 48.0, "is_trending": False},
    {"name": "edge AI inference", "category": "AI Infrastructure", "precursor_score": 55.0, "is_trending": False},
    {"name": "power semiconductor GaN SiC", "category": "Semiconductor", "precursor_score": 67.0, "is_trending": True},
    {"name": "solid-state battery", "category": "Energy", "precursor_score": 52.0, "is_trending": False},
    {"name": "grid storage", "category": "Energy", "precursor_score": 50.0, "is_trending": False},
    {"name": "humanoid robotics", "category": "Robotics", "precursor_score": 64.0, "is_trending": True},
    {"name": "autonomous driving perception", "category": "Robotics", "precursor_score": 58.0, "is_trending": False},
    {"name": "SmartNIC DPU", "category": "Infrastructure", "precursor_score": 62.0, "is_trending": False},
    {"name": "NVMe-oF disaggregation", "category": "Storage", "precursor_score": 56.0, "is_trending": False},
    {"name": "flash controller", "category": "Storage", "precursor_score": 54.0, "is_trending": False},
]

_DASHBOARD_COMPANIES = [
    {"name": "NVIDIA", "ticker": "NVDA", "benefit_score": 95.0, "benefit_type": "direct"},
    {"name": "AMD", "ticker": "AMD", "benefit_score": 80.0, "benefit_type": "direct"},
    {"name": "TSMC", "ticker": "TSM", "benefit_score": 88.0, "benefit_type": "direct"},
    {"name": "Micron", "ticker": "MU", "benefit_score": 82.0, "benefit_type": "direct"},
    {"name": "Samsung", "ticker": "005930.KS", "benefit_score": 78.0, "benefit_type": "direct"},
    {"name": "SK hynix", "ticker": "000660.KS", "benefit_score": 80.0, "benefit_type": "direct"},
    {"name": "Kioxia", "ticker": None, "benefit_score": 70.0, "benefit_type": "direct"},
    {"name": "SanDisk", "ticker": None, "benefit_score": 65.0, "benefit_type": "direct"},
    {"name": "Tokyo Electron", "ticker": "8035.T", "benefit_score": 72.0, "benefit_type": "indirect"},
    {"name": "Fujikura", "ticker": "5803.T", "benefit_score": 68.0, "benefit_type": "indirect"},
]

_DASHBOARD_SUPPLY_CHAIN = [
    {"from": "GPU memory bottleneck", "to": "HBM", "rel": "GPU需要 → HBM需要", "order": 1},
    {"from": "HBM", "to": "SSD / NVMe", "rel": "HBM拡張 → NVMe SSD需要増", "order": 2},
    {"from": "SSD / NVMe", "to": "I/O bottleneck", "rel": "SSD普及 → I/Oボトルネック顕在化", "order": 3},
    {"from": "I/O bottleneck", "to": "KV cache offloading", "rel": "I/O制約 → KVキャッシュオフロード技術需要", "order": 4},
    {"from": "GPU memory bottleneck", "to": "data center power", "rel": "GPU増設 → データセンター電力需要", "order": 5},
    {"from": "data center power", "to": "robotics foundation model", "rel": "電力インフラ整備 → ロボティクス基盤モデル展開", "order": 6},
]

# Papers — 実データ優先(SOT-909)。collected-papers.json に arXiv/Semantic Scholar 由来の
# 実在論文(実タイトル・実発行年・実引用数・実リンク)があればそれを使い、無ければ従来の
# 合成データ(オフライン/テスト用フォールバック)で decade 分を生成する。実データは実年で
# 分布するため paper_counts_by_year / theme-citations が実データの動きを示す。
_COLLECTED_PAPERS = _load_collected_papers([t["name"] for t in _DASHBOARD_THEMES])
_USING_REAL_PAPERS = bool(_COLLECTED_PAPERS)
_DASHBOARD_PAPERS = _COLLECTED_PAPERS or _decade_papers([t["name"] for t in _DASHBOARD_THEMES])

# 10 years (120 months) of monthly counts per theme, rising over the decade.
_DASHBOARD_MONTHLY_COUNTS = [
    {"theme": "GPU memory bottleneck", "keyword": "GPU memory",
        "counts": _decade_monthly_counts(8, 180)},
    {"theme": "HBM", "keyword": "HBM", "counts": _decade_monthly_counts(4, 150)},
    {"theme": "SSD / NVMe", "keyword": "NVMe", "counts": _decade_monthly_counts(15, 120)},
]


def seed_dashboard_data_firestore():
    """本番(Firestore)向けにダッシュボードのコアデータを冪等投入する。

    ダッシュボード (`/api/dashboard/`) は Firestore の themes / companies / papers /
    supply_chains / paper_monthly_counts / scores コレクションを参照するが、これらを投入する
    `run_seed()` は SQLite (local/test) 専用。本番では別途 Firestore へ投入しないと
    ダッシュボードが空になる。冪等(themesが既存ならスキップ)。失敗しても起動を妨げない。"""
    import logging

    logger = logging.getLogger(__name__)

    try:
        from .repositories.theme_repository import get_theme_repository
        from .repositories.company_repository import get_company_repository
        from .repositories.paper_repository import get_paper_repository
        from .repositories.supply_chain_repository import get_supply_chain_repository
        from .repositories.trend_repository import get_trend_repository
        from .repositories.score_repository import get_score_repository

        # Deterministic theme ids (stable slug ids so cross-references resolve). Computed
        # unconditionally so the papers/monthly top-up below works even when themes already exist.
        theme_ids = {t["name"]: f"theme-{_slug(t['name'])}" for t in _DASHBOARD_THEMES}

        theme_repo = get_theme_repository()
        # First-seed (themes/companies/supply-chain/scores): only on an empty dashboard.
        if not theme_repo.list_all():
            # 1. Themes
            for t in _DASHBOARD_THEMES:
                theme_repo.save({"id": theme_ids[t["name"]], **t})

            # 2. Companies (tickers drive the per-company 10y stock-eval cards)
            company_repo = get_company_repository()
            for c in _DASHBOARD_COMPANIES:
                company_repo.save({"id": f"company-{_slug(c['name'])}", **c})

            # 4. Supply chain
            sc_repo = get_supply_chain_repository()
            for sc in _DASHBOARD_SUPPLY_CHAIN:
                sc_repo.save({
                    "from_theme_id": theme_ids[sc["from"]],
                    "to_theme_id": theme_ids[sc["to"]],
                    "relationship": sc["rel"],
                    "order": sc["order"],
                })

            # 6. Scores (alignment_highlights uses score>=30)
            score_repo = get_score_repository()
            for t in _DASHBOARD_THEMES:
                score_repo.save({
                    "theme_id": theme_ids[t["name"]],
                    "score": t["precursor_score"],
                    "confidence": 0.6,
                })

        # 3 & 5. Papers + monthly counts: idempotent top-up that ALWAYS runs (repos upsert by
        # paper_id / theme_id+keyword+year_month). This lets an already-seeded prod Firestore
        # gain the full 10-year dataset on the next deploy without overwriting other data.
        paper_repo = get_paper_repository()
        for p in _DASHBOARD_PAPERS:
            tid = theme_ids.get(p["theme"])
            if not tid:
                continue
            paper_repo.save({
                "paper_id": p["pid"],
                "title": p["title"],
                "url": p.get("url"),
                "abstract": p.get("abstract"),
                "published_at": p["pub"],
                "theme_id": tid,
                "citation_count": p.get("citation", 0),
                "source": p.get("source", "arxiv" if p.get("url") else "manual"),
            })

        # Reconcile (冪等・無ければno-op):
        # - 実データ移行時(_USING_REAL_PAPERS): 本番に残る旧合成doc(paper-<slug>-<year>-NN)を全削除し、
        #   ダッシュボードを実データのみにする。
        # - 合成データ時: 年次可変化で不要になった余剰doc(index>=目標件数)だけを削除し、過去年バーの
        #   底上げ(約10件)を防いで「年ごとの動き」を保つ。
        if _USING_REAL_PAPERS:
            stale_ids = _legacy_synthetic_paper_ids([t["name"] for t in _DASHBOARD_THEMES])
        else:
            stale_ids = _stale_paper_ids([t["name"] for t in _DASHBOARD_THEMES])
        deleted = 0
        for pid in stale_ids:
            if paper_repo.delete(pid):
                deleted += 1

        trend_repo = get_trend_repository()
        for pm in _DASHBOARD_MONTHLY_COUNTS:
            prev_count = 0
            for i, count in enumerate(pm["counts"]):
                month = _month_str(_DECADE_FROM_YEAR, i)
                mom_change = ((count - prev_count) / prev_count * 100) if prev_count > 0 else 0.0
                trend_repo.save_monthly_count({
                    "theme_id": theme_ids[pm["theme"]],
                    "keyword": pm["keyword"],
                    "year_month": month,
                    "count": count,
                    "prev_month_count": prev_count,
                    "mom_change_pct": mom_change,
                })
                prev_count = count

        logger.info(
            "Seeded dashboard core data to Firestore: %d themes, %d companies, %d papers "
            "(%d stale legacy papers reconciled/removed)",
            len(_DASHBOARD_THEMES), len(_DASHBOARD_COMPANIES), len(_DASHBOARD_PAPERS), deleted,
        )
    except Exception as e:  # noqa: BLE001 - startup must never crash on seeding failure
        logger.warning(f"Could not seed dashboard data to Firestore: {e}")


def seed_investors_firestore():
    """本番(Firestore)向けに機関投資家(13F実データ)を冪等投入する(SOT-965)。
    `run_seed()` は SQLite 専用のため、本番では別途 institutional_investors コレクションへ
    投入しないと投資家情報ページが空になる。冪等(既に投入済みならスキップ)。
    調査・仮説検証用の公開開示データであり投資助言ではない。失敗しても起動を妨げない。"""
    import logging

    logger = logging.getLogger(__name__)

    try:
        records = _load_collected_investors()
        if not records:
            return

        from .repositories.investor_repository import get_investor_repository

        repo = get_investor_repository()
        if repo.list_all():
            return

        seeded = 0
        for rec in records:
            company_name = rec.get("company_name")
            if not company_name:
                continue
            data = {
                "investor_name": rec["investor_name"],
                "company_id": f"company-{_slug(company_name)}",
                "ownership_pct": rec.get("ownership_pct", 0.0),
                "change_pct": rec.get("change_pct", 0.0),
                "report_date": rec.get("report_date"),
                "report_type": rec.get("report_type", "13F"),
                "notes": rec.get("notes"),
            }
            if repo.save(data):
                seeded += 1
        logger.info("Seeded %d institutional investors to Firestore", seeded)
    except Exception as e:  # noqa: BLE001 - startup must never crash on seeding failure
        logger.warning(f"Could not seed institutional investors to Firestore: {e}")


def seed_stock_prices(db, companies):
    import random
    import datetime
    from . import models

    # Deterministic seeding. 過去10年(_DECADE_FROM_YEAR〜_DECADE_TO_YEAR)の StockPrice テーブル補助seed。
    # ダッシュボードの株価グラフ/バックテストは backend/data/stock-prices.json（同梱・実データ）を
    # 直接読むため（SOT-941）、このローカルseedはグラフ表示には使われない。
    start_date = datetime.date(_DECADE_FROM_YEAR, 1, 1)
    end_date = datetime.date(_DECADE_TO_YEAR, 12, 31)

    for company in companies.values():
        if not company.ticker:
            continue

        # Give each ticker a unique but deterministic seed based on ticker string
        ticker_seed = sum(ord(c) for c in company.ticker)
        ticker_rng = random.Random(ticker_seed)

        current_price = ticker_rng.uniform(50.0, 500.0)
        volatility = ticker_rng.uniform(0.01, 0.03)
        drift = ticker_rng.uniform(-0.0001, 0.0005)

        current_date = start_date
        while current_date <= end_date:
            # Simple random walk
            change = current_price * (drift + volatility * ticker_rng.normalvariate(0, 1))
            current_price += change
            if current_price < 0.1:
                current_price = 0.1

            db.add(models.StockPrice(
                ticker=company.ticker,
                date=current_date.strftime("%Y-%m-%d"),
                close=round(current_price, 2),
                company_id=company.id
            ))
            current_date += datetime.timedelta(days=1)


def _compute_alignment(db, theme_id):
    from . import models
    from .services.scoring import calculate_alignment_score

    N = db.query(models.ExternalInfo).filter(
        models.ExternalInfo.theme_id == theme_id,
        models.ExternalInfo.info_type == "news"
    ).count()
    A = db.query(models.ExternalInfo).filter(
        models.ExternalInfo.theme_id == theme_id,
        models.ExternalInfo.info_type == "announcement"
    ).count()
    E = db.query(models.ExternalInfo).filter(
        models.ExternalInfo.theme_id == theme_id,
        models.ExternalInfo.info_type == "earnings"
    ).count()

    # Get latest mom_change_pct for the theme
    latest_pm = db.query(models.PaperMonthlyCount).filter(
        models.PaperMonthlyCount.theme_id == theme_id
    ).order_by(models.PaperMonthlyCount.year_month.desc()).first()
    latest_mom = latest_pm.mom_change_pct if latest_pm else 0.0

    return calculate_alignment_score(N, A, E, latest_mom_change_pct=latest_mom)


def seed_external_infos(db):
    import os
    if os.getenv("USE_SAMPLE_DATA") != "true":
        return

    sample_data = {
        "GPU memory bottleneck": {  # Often matched with "GPU" or "AI Infrastructure"
            "news": [
                (
                    "sample-news-ai-001",
                    "NVIDIA Announces Next-Gen AI Data Center Platform",
                    "2024-03-15",
                    "NVIDIA unveiled its next-generation AI infrastructure platform.",
                    "techcrunch",
                    None,
                ),
                (
                    "sample-news-ai-002",
                    "Google DeepMind Releases New AI Research on Transformer Scaling",
                    "2024-03-10",
                    "New research shows transformer scaling laws continue to hold.",
                    "theverge",
                    None,
                ),
                (
                    "sample-news-ai-003",
                    "Microsoft Azure AI Capacity Expansion Announced",
                    "2024-02-28",
                    "Microsoft doubles AI compute capacity in Azure data centers.",
                    "bloomberg",
                    None,
                ),
            ],
            "announcements": [
                (
                    "sample-ann-ai-001",
                    "NVIDIA Q1 FY2025 Earnings: AI Revenue Grows 400%",
                    "2024-02-21",
                    "NVIDIA reports record AI revenue in quarterly earnings.",
                    "NVIDIA IR",
                    "NVIDIA",
                ),
                (
                    "sample-ann-ai-002",
                    "AMD Launches MI300X AI Accelerator for Enterprise",
                    "2024-03-06",
                    "AMD announces general availability of MI300X.",
                    "AMD IR",
                    "AMD",
                ),
            ],
            "earnings": [
                (
                    "sample-earn-ai-001",
                    "NVIDIA CEO: AI demand is insatiable - Q1 2025 Earnings Call",
                    "2024-02-21",
                    "Jensen Huang emphasizes strong and growing AI demand.",
                    "earnings_call",
                    "NVIDIA",
                ),
                (
                    "sample-earn-ai-002",
                    "Microsoft CFO: Data center AI capex increasing significantly",
                    "2024-01-30",
                    "Microsoft increases AI infrastructure investment guidance.",
                    "earnings_call",
                    "Microsoft",
                ),
            ],
        },
        "SSD / NVMe": {
            "news": [
                (
                    "sample-news-gpu-001",
                    "TSMC Boosts GPU Wafer Capacity for 2024",
                    "2024-03-12",
                    "TSMC increases N3 wafer capacity primarily for GPU clients.",
                    "reuters",
                    None,
                ),
                (
                    "sample-news-gpu-002",
                    "AMD RDNA 4 GPU Architecture Details Revealed",
                    "2024-03-08",
                    "AMD reveals next-generation GPU architecture.",
                    "anandtech",
                    None,
                ),
                (
                    "sample-news-gpu-003",
                    "Nvidia H200 GPU Shipments Begin at Scale",
                    "2024-02-20",
                    "Nvidia H200 with HBM3e enters volume production.",
                    "tomshardware",
                    None,
                ),
            ],
            "announcements": [
                (
                    "sample-ann-gpu-001",
                    "NVIDIA Blackwell GPU Architecture Announced",
                    "2024-03-18",
                    "NVIDIA B100 and B200 GPUs announced for AI workloads.",
                    "NVIDIA IR",
                    "NVIDIA",
                ),
                (
                    "sample-ann-gpu-002",
                    "AMD MI300 Series Production Ramp Confirmed",
                    "2024-01-30",
                    "AMD confirms MI300 series is in volume production.",
                    "AMD IR",
                    "AMD",
                ),
            ],
            "earnings": [
                (
                    "sample-earn-gpu-001",
                    "NVIDIA: GPU backlog extends to 12 months due to AI demand",
                    "2024-02-21",
                    "Nvidia reports GPU order backlog extending well into 2025.",
                    "earnings_call",
                    "NVIDIA",
                ),
                (
                    "sample-earn-gpu-002",
                    "TSMC: Advanced node capacity fully booked by GPU and AI clients",
                    "2024-01-18",
                    "TSMC reports CoWoS and N3 fully subscribed.",
                    "earnings_call",
                    "TSMC",
                ),
            ],
        },
        "HBM": {
            "news": [
                (
                    "sample-news-hbm-001",
                    "SK Hynix HBM3E Enters Mass Production",
                    "2024-03-19",
                    "SK Hynix begins volume shipments of HBM3E for H200.",
                    "koreatimes",
                    None,
                ),
                (
                    "sample-news-hbm-002",
                    "Micron Accelerates HBM4 Development Timeline",
                    "2024-02-15",
                    "Micron targets HBM4 samples by end of 2024.",
                    "digitimes",
                    None,
                ),
                (
                    "sample-news-hbm-003",
                    "HBM Demand Surge Raises Memory Sector Valuations",
                    "2024-02-10",
                    "Analyst upgrades for HBM suppliers on AI demand.",
                    "bloomberg",
                    None,
                ),
            ],
            "announcements": [
                (
                    "sample-ann-hbm-001",
                    "SK Hynix Announces $15B HBM Capacity Expansion",
                    "2024-03-05",
                    "SK Hynix to invest in new HBM production lines.",
                    "SK Hynix IR",
                    "SK Hynix",
                ),
                (
                    "sample-ann-hbm-002",
                    "Samsung Develops 36GB HBM4 for AI Accelerators",
                    "2024-01-18",
                    "Samsung HBM4 doubles bandwidth vs HBM3E.",
                    "Samsung IR",
                    "Samsung",
                ),
            ],
            "earnings": [
                (
                    "sample-earn-hbm-001",
                    "SK Hynix CFO: HBM ASP up 3x year-over-year",
                    "2024-01-25",
                    "HBM average selling prices tripled on AI demand.",
                    "earnings_call",
                    "SK Hynix",
                ),
                (
                    "sample-earn-hbm-002",
                    "Micron CEO: HBM supply constrained through 2025",
                    "2024-03-20",
                    "Micron confirms HBM supply tightly constrained.",
                    "earnings_call",
                    "Micron",
                ),
            ],
        }
    }

    for theme_name, data in sample_data.items():
        theme = db.query(models.Theme).filter(models.Theme.name.ilike(f"%{theme_name}%")).first()
        if not theme:
            continue

        # Insert records
        for info_type, items in data.items():
            # info_type in sample_data is news/announcements/earnings
            # DB info_type is news/announcement/earnings
            db_type = "announcement" if info_type == "announcements" else info_type

            for item in items:
                info_id, title, published_at, summary, source_name, related_company = item
                if db.query(models.ExternalInfo).filter(models.ExternalInfo.info_id == info_id).first():
                    continue

                db_info = models.ExternalInfo(
                    info_id=info_id,
                    info_type=db_type,
                    title=title,
                    published_at=published_at,
                    summary=summary,
                    source_name=source_name,
                    related_company=related_company,
                    theme_id=theme.id,
                    relevance_score=80.0  # Default for sample
                )
                db.add(db_info)

        db.commit()

        # Compute Alignment for themes with sample data
        stats = _compute_alignment(db, theme.id)
        alignment = db.query(models.AlignmentScore).filter(models.AlignmentScore.theme_id == theme.id).first()
        if not alignment:
            alignment = models.AlignmentScore(theme_id=theme.id, **stats)
            db.add(alignment)
        else:
            for k, v in stats.items():
                setattr(alignment, k, v)
        db.commit()

    # Ensure ALL themes have an AlignmentScore row
    all_themes = db.query(models.Theme).all()
    for t in all_themes:
        existing_as = db.query(models.AlignmentScore).filter(models.AlignmentScore.theme_id == t.id).first()
        if not existing_as:
            stats = _compute_alignment(db, t.id)
            db.add(models.AlignmentScore(theme_id=t.id, **stats))
    db.commit()
