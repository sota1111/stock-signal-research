from .database import SessionLocal
from . import models


def run_seed():
    db = SessionLocal()
    try:
        if db.query(models.Theme).first() is not None:
            return

        # 1. Themes
        themes_data = [
            {"name": "SSD / NVMe", "category": "Storage", "precursor_score": 72.0, "is_trending": True},
            {
                "name": "GPU memory bottleneck",
                "category": "AI Infrastructure",
                "precursor_score": 85.0,
                "is_trending": True,
            },
            {"name": "HBM", "category": "Memory", "precursor_score": 78.0, "is_trending": True},
            {
                "name": "KV cache offloading",
                "category": "AI Infrastructure",
                "precursor_score": 65.0,
                "is_trending": False,
            },
            {"name": "I/O bottleneck", "category": "AI Infrastructure", "precursor_score": 58.0, "is_trending": False},
            {"name": "data center power", "category": "Infrastructure", "precursor_score": 70.0, "is_trending": True},
            {
                "name": "robotics foundation model",
                "category": "Robotics",
                "precursor_score": 62.0,
                "is_trending": False,
            },
        ]
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

        # 4. Papers
        papers_data = [
            {"title": "Efficient GPU Memory Management for Large Language Models",
                "pub": "2024-03", "theme": "GPU memory bottleneck", "pid": "paper_001"},
            {"title": "HBM3E: Next Generation High Bandwidth Memory Architecture",
                "pub": "2024-05", "theme": "HBM", "pid": "paper_002"},
            {"title": "NVMe over Fabrics Performance Optimization",
                "pub": "2024-02", "theme": "SSD / NVMe", "pid": "paper_003"},
            {"title": "KV Cache Compression for Transformer Inference",
                "pub": "2024-06", "theme": "KV cache offloading", "pid": "paper_004"},
            {"title": "Data Center Power Efficiency in the Age of AI",
                "pub": "2024-04", "theme": "data center power", "pid": "paper_005"},
        ]
        for p in papers_data:
            db_paper = models.Paper(
                paper_id=p["pid"],
                title=p["title"],
                published_at=p["pub"],
                theme_id=themes[p["theme"]].id
            )
            db.add(db_paper)

        # 5. PaperMonthlyCount
        pm_data = [
            {"theme": "GPU memory bottleneck", "keyword": "GPU memory",
                "counts": [10, 12, 14, 18, 22, 28, 35, 42, 50, 58, 65, 75]},
            {"theme": "HBM", "keyword": "HBM", "counts": [5, 6, 8, 10, 14, 18, 24, 30, 38, 45, 52, 60]},
            {"theme": "SSD / NVMe", "keyword": "NVMe", "counts": [20, 22, 25, 28, 30, 32, 30, 33, 36, 40, 45, 52]},
        ]
        for pm in pm_data:
            prev_count = 0
            for i, count in enumerate(pm["counts"]):
                month = f"2024-{i+1:02d}"
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

        # 6. Institutional Investors
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


def seed_stock_prices(db, companies):
    import random
    import datetime
    from . import models

    # Deterministic seeding
    start_date = datetime.date(2024, 1, 1)
    end_date = datetime.date(2024, 12, 31)

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
