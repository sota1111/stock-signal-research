from sqlalchemy.orm import Session
from .database import SessionLocal, engine
from . import models
import json

def run_seed():
    db = SessionLocal()
    try:
        if db.query(models.Theme).first() is not None:
            return

        # 1. Themes
        themes_data = [
            {"name": "SSD / NVMe", "category": "Storage", "precursor_score": 72.0, "is_trending": True},
            {"name": "GPU memory bottleneck", "category": "AI Infrastructure", "precursor_score": 85.0, "is_trending": True},
            {"name": "HBM", "category": "Memory", "precursor_score": 78.0, "is_trending": True},
            {"name": "KV cache offloading", "category": "AI Infrastructure", "precursor_score": 65.0, "is_trending": False},
            {"name": "I/O bottleneck", "category": "AI Infrastructure", "precursor_score": 58.0, "is_trending": False},
            {"name": "data center power", "category": "Infrastructure", "precursor_score": 70.0, "is_trending": True},
            {"name": "robotics foundation model", "category": "Robotics", "precursor_score": 62.0, "is_trending": False},
        ]
        themes = {}
        for t in themes_data:
            db_theme = models.Theme(**t)
            db.add(db_theme)
            db.flush() # To get the ID
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
            {"from": "data center power", "to": "robotics foundation model", "rel": "電力インフラ整備 → ロボティクス基盤モデル展開", "order": 6},
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
            {"title": "Efficient GPU Memory Management for Large Language Models", "pub": "2024-03", "theme": "GPU memory bottleneck", "pid": "paper_001"},
            {"title": "HBM3E: Next Generation High Bandwidth Memory Architecture", "pub": "2024-05", "theme": "HBM", "pid": "paper_002"},
            {"title": "NVMe over Fabrics Performance Optimization", "pub": "2024-02", "theme": "SSD / NVMe", "pid": "paper_003"},
            {"title": "KV Cache Compression for Transformer Inference", "pub": "2024-06", "theme": "KV cache offloading", "pid": "paper_004"},
            {"title": "Data Center Power Efficiency in the Age of AI", "pub": "2024-04", "theme": "data center power", "pid": "paper_005"},
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
            {"theme": "GPU memory bottleneck", "keyword": "GPU memory", "counts": [10,12,14,18,22,28,35,42,50,58,65,75]},
            {"theme": "HBM", "keyword": "HBM", "counts": [5,6,8,10,14,18,24,30,38,45,52,60]},
            {"theme": "SSD / NVMe", "keyword": "NVMe", "counts": [20,22,25,28,30,32,30,33,36,40,45,52]},
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
            {"name": "Vanguard Group", "company": "NVIDIA", "pct": 8.5, "chg": 0.3, "date": "2024-09-30", "type": "13F"},
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

        db.commit()
    finally:
        db.close()
