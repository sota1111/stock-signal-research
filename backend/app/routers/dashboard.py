from typing import Optional
from fastapi import APIRouter, Query
from .. import schemas
from ..repositories.theme_repository import get_theme_repository
from ..repositories.company_repository import get_company_repository
from ..repositories.score_repository import get_score_repository
from ..repositories.supply_chain_repository import get_supply_chain_repository
from ..repositories.trend_repository import get_trend_repository
from ..repositories.paper_repository import get_paper_repository
from ..services.signal_report import generate_signal_report
from ..services.market_data import fetch_stock_data

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stock", response_model=schemas.StockDataResponse)
def get_stock(
    ticker: str = Query(..., description="銘柄コード/ティッカー（日本株は数字コードのみでも可、例 7203）"),
    years: int = Query(10, ge=1, le=20, description="取得する過去年数"),
):
    """指定銘柄の過去株価・財務指標を yfinance 経由で取得して返す。

    外部APIキーは不要。日本株は数字コードへ自動的に `.T` を付与する（例 7203 → 7203.T）。
    取得に失敗した場合も例外は返さず、`error` フィールドに理由を設定した同一形状で返す。
    """
    return fetch_stock_data(ticker, years)


@router.get("/signal-report", response_model=schemas.SignalReportResponse)
def get_signal_report(
    query: str = Query(..., description="集計対象テーマ/キーワード"),
    from_year: Optional[int] = Query(None, description="集計開始年（未指定で直近10年）"),
    to_year: Optional[int] = Query(None, description="集計終了年（未指定で現在年）"),
    top_n: int = Query(5, ge=1, le=50, description="注目企業の最大件数"),
    surge_top_n: int = Query(10, ge=1, le=100, description="急増キーワードの最大件数"),
):
    """投資前兆ダッシュボード用の統一シグナルレポートJSONを返す。

    既存DBの論文・企業辞書から、年別論文件数・急増キーワード・注目企業TOP5（根拠付き）・
    サプライチェーン連鎖（ノード/エッジ）を集計する。外部APIキーは不要。
    """
    paper_repo = get_paper_repository()
    company_repo = get_company_repository()
    papers = paper_repo.list_all()
    companies = company_repo.list_all()
    return generate_signal_report(
        query=query,
        papers=papers,
        companies=companies,
        from_year=from_year,
        to_year=to_year,
        top_n=top_n,
        surge_top_n=surge_top_n,
    )


@router.get("/", response_model=schemas.DashboardResponse)
def get_dashboard():
    theme_repo = get_theme_repository()
    company_repo = get_company_repository()
    score_repo = get_score_repository()
    sc_repo = get_supply_chain_repository()
    trend_repo = get_trend_repository()

    # trending_themes: 注目テーマを前兆スコアの高い順に最大30件表示する
    trending_themes = sorted(
        theme_repo.list_all(),
        key=lambda t: t.get("precursor_score", 0) or 0,
        reverse=True,
    )[:30]

    # top_keywords: top 10 PaperMonthlyCount by mom_change_pct (add theme_name field)
    pm_counts = trend_repo.list_monthly_counts(limit=10)
    top_keywords = []
    for pm in pm_counts:
        theme = theme_repo.get_by_id(pm["theme_id"])
        top_keywords.append({
            "keyword": pm["keyword"],
            "mom_change_pct": pm["mom_change_pct"],
            "theme_name": theme["name"] if theme else "Unknown"
        })

    # notable_companies: top 5 by benefit_score
    notable_companies = company_repo.list_all()[:5]

    # supply_chain_highlights: all supply chain items ordered by order
    sc_results = sc_repo.list_all()
    supply_chain_highlights = []
    for item in sc_results:
        from_theme = theme_repo.get_by_id(item["from_theme_id"])
        to_theme = theme_repo.get_by_id(item["to_theme_id"])

        res_item = schemas.SupplyChainResponse.model_validate(item)
        res_item.from_theme_name = from_theme["name"] if from_theme else None
        res_item.to_theme_name = to_theme["name"] if to_theme else None
        supply_chain_highlights.append(res_item)

    # alignment_highlights
    alignment_rows = score_repo.list_top(10)

    high_alignment = []
    paper_only_ids = set()
    for row in alignment_rows:
        theme = theme_repo.get_by_id(row["theme_id"])
        if not theme:
            continue
        if row["score"] >= 30:
            high_alignment.append({"theme": theme, "score": row["score"], "confidence": row["confidence"]})
            paper_only_ids.add(theme["id"])

    paper_only = []
    # Re-using trending_themes or fetching more if needed
    all_themes = theme_repo.list_all()
    for theme in all_themes[:20]:  # Check top 20 for paper_only
        if theme["id"] not in paper_only_ids and theme["precursor_score"] >= 20:
            paper_only.append({"theme": theme, "precursor_score": theme["precursor_score"]})
        if len(paper_only) >= 5:
            break

    alignment_highlights = {
        "high_alignment": high_alignment[:5],
        "paper_only": paper_only[:5],
    }

    return {
        "trending_themes": trending_themes,
        "top_keywords": top_keywords,
        "notable_companies": notable_companies,
        "supply_chain_highlights": supply_chain_highlights,
        "alignment_highlights": alignment_highlights
    }
