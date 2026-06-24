from typing import Optional
from fastapi import APIRouter, Query
from .. import schemas
from ..repositories.theme_repository import get_theme_repository
from ..repositories.company_repository import get_company_repository
from ..repositories.score_repository import get_score_repository
from ..repositories.supply_chain_repository import get_supply_chain_repository
from ..repositories.trend_repository import get_trend_repository
from ..repositories.paper_repository import get_paper_repository
from ..services.signal_report import (
    generate_signal_report,
    aggregate_theme_citations,
    aggregate_theme_citation_matrix,
    aggregate_category_paper_averages,
    aggregate_category_paper_counts,
)
from ..services.market_data import fetch_stock_data
from ..services.backtest import backtest_signals
from ..services.market_cap_history import build_category_market_cap, list_categories
from ..services.financial_fundamentals import (
    build_company_fundamentals,
    list_fundamentals_companies,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stock", response_model=schemas.StockDataResponse)
def get_stock(
    ticker: str = Query(..., description="銘柄コード/ティッカー（日本株は数字コードのみでも可、例 7203）"),
    years: int = Query(10, ge=1, le=30, description="取得する過去年数（2000年から=約26年に対応）"),
):
    """指定銘柄の過去株価・財務指標を同梱データ（backend/data/stock-prices.json）から返す。

    外部APIキー・ランタイムのネットワーク取得は不要（SOT-941）。日本株は数字コードへ
    自動的に `.T` を付与する（例 7203 → 7203.T）。同梱データに該当銘柄が無い場合も例外は
    返さず、`error` フィールドに理由を設定した同一形状で返す。
    """
    return fetch_stock_data(ticker, years)


@router.get("/backtest", response_model=schemas.BacktestResponse)
def get_backtest(
    ticker: str = Query(..., description="銘柄コード/ティッカー（日本株は数字コードのみでも可、例 7203）"),
    years: int = Query(10, ge=1, le=30, description="バックテスト対象の過去年数（2000年から=約26年に対応）"),
):
    """指定銘柄の過去株価データに対し、各テクニカルシグナルをバックテストした結果を返す。

    ゴールデン/デッドクロス・RSI反転シグナルそれぞれについて、発生回数と、発生時点から
    5/20/60営業日後のフォワードリターンに基づく的中率・平均リターンを集計する。
    外部APIキーは不要。株価取得に失敗した場合は `error` を設定して返す。
    """
    stock = fetch_stock_data(ticker, years)
    result = backtest_signals(stock.get("prices", []), ticker=stock.get("ticker"))
    if stock.get("error"):
        result["error"] = stock["error"]
    return result


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


@router.get("/theme-citations", response_model=schemas.ThemeCitationsResponse)
def get_theme_citations(
    top_n: int = Query(100, ge=1, le=200, description="1テーマあたり集計する引用数上位論文数"),
):
    """テーマごとの「引用数上位 top_n 論文の総引用数」と、その上位論文（link/概要/引用数）を返す。

    ダッシュボードの主要指標を「論文件数」から「引用数」に切り替えるためのデータ。各テーマ名に
    一致する論文を citation_count 降順で並べ、上位 top_n 本と総引用数を集計する。外部APIキー不要。
    引用数は OpenAlex 由来（収集ジョブが付与）。
    """
    paper_repo = get_paper_repository()
    theme_repo = get_theme_repository()
    papers = paper_repo.list_all()
    themes = theme_repo.list_all()
    return aggregate_theme_citations(papers=papers, themes=themes, top_n=top_n)


@router.get("/theme-citation-matrix", response_model=schemas.ThemeCitationMatrixResponse)
def get_theme_citation_matrix(
    years: int = Query(10, ge=1, le=30, description="列に表示する直近の年数（from_year 未指定時のみ）"),
    from_year: Optional[int] = Query(None, ge=1900, le=2100, description="列の開始年（指定で from_year..現在年, SOT-1081: 2009起点）"),
):
    """テーマ×年の引用数合計マトリクスを返す（行=テーマ / 列=年 / セル=引用数合計）。

    各テーマ名に一致する論文を年別にバケットし、citation_count を合計する。テーマ別合計
    （行合計）・年別合計（列合計）・総合計を併せて返す。`from_year` 指定時は列を
    from_year..現在年にする（SOT-1081 要件①）。外部APIキー不要。
    """
    paper_repo = get_paper_repository()
    theme_repo = get_theme_repository()
    papers = paper_repo.list_all()
    themes = theme_repo.list_all()
    return aggregate_theme_citation_matrix(
        papers=papers, themes=themes, years=years, from_year=from_year
    )


@router.get("/category-paper-averages", response_model=schemas.CategoryPaperAveragesResponse)
def get_category_paper_averages(
    from_year: Optional[int] = Query(None, description="集計開始年（未指定で全論文の最小年）"),
    to_year: Optional[int] = Query(None, description="集計終了年（未指定で全論文の最大年）"),
):
    """カテゴリグループ（Theme.category）別の「テーマあたり平均論文数」を年次で返す（SOT-1049）。

    各カテゴリの年内論文数を、そのカテゴリに属するテーマ数（0件テーマも分母に含む）で割った
    平均を年別に返す。テーマ数の多寡に依らず「論文数が増えたか」をカテゴリ間で比較できる。
    外部APIキー不要。
    """
    paper_repo = get_paper_repository()
    theme_repo = get_theme_repository()
    papers = paper_repo.list_all()
    themes = theme_repo.list_all()
    return aggregate_category_paper_averages(
        papers=papers, themes=themes, from_year=from_year, to_year=to_year
    )


@router.get("/category-paper-counts", response_model=schemas.CategoryPaperCountsResponse)
def get_category_paper_counts(
    category: str = Query(..., description="対象の大カテゴリ（Theme.category）"),
    from_year: Optional[int] = Query(None, description="集計開始年（未指定で観測最小年, SOT-1081: 2009起点）"),
    to_year: Optional[int] = Query(None, description="集計終了年（未指定で現在年）"),
):
    """指定大カテゴリ内の「テーマ別 年次論文数」を返す（SOT-1081 要件③④）。

    大カテゴリを選択すると、その中のカテゴリ（=テーマ）ごとの年別論文数を折れ線で
    表示するためのデータ。論文が1件以上あるテーマのみ総数降順で返す。外部APIキー不要。
    """
    paper_repo = get_paper_repository()
    theme_repo = get_theme_repository()
    papers = paper_repo.list_all()
    themes = theme_repo.list_all()
    return aggregate_category_paper_counts(
        papers=papers, themes=themes, category=category, from_year=from_year, to_year=to_year
    )


@router.get("/categories", response_model=schemas.CategoryListResponse)
def get_categories():
    """カテゴリ（テーマ）一覧を返す（SOT-1056）。各テーマに真の歴史的時価総額データがあるかを併記。

    フロントのカテゴリセレクタ用。`has_market_cap=True` のテーマのみグラフを描画できる。
    """
    theme_repo = get_theme_repository()
    company_repo = get_company_repository()
    return {"categories": list_categories(theme_repo, company_repo)}


@router.get("/category-market-cap", response_model=schemas.CategoryMarketCapResponse)
def get_category_market_cap(
    theme_id: str = Query(..., description="対象テーマ（カテゴリ）ID"),
    top_n: int = Query(10, ge=1, le=30, description="採用する上位社数（一度でも上位N入りした企業の和集合）"),
):
    """指定カテゴリ（テーマ）の上位 top_n 社の「真の歴史的時価総額（年次）」系列を返す（SOT-1056 / B-3）。

    `backend/data/market-cap-history.json`（SEC EDGAR の発行株式数 × 同梱株価, 米国・2009年〜）に基づく。
    ある年に時価総額上位 top_n に**一度でも**入った企業（期間通算の和集合）を系列にする。フロント側の
    近似（現在時価総額×株価比）は使わない。データが無いテーマは空系列を返す（例外は投げない）。
    """
    theme_repo = get_theme_repository()
    company_repo = get_company_repository()
    return build_category_market_cap(theme_id, theme_repo, company_repo, top_n=top_n)


@router.get("/fundamentals-companies", response_model=schemas.FundamentalsCompaniesResponse)
def get_fundamentals_companies():
    """財務ファンダメンタルズ時系列データを持つ企業一覧を返す（SOT-1121 / 候補D）。

    フロントの企業セレクタ用。`has_data=True` の企業のみチャートを描画できる。
    `backend/data/financial-fundamentals.json`（SEC EDGAR XBRL 由来）に基づく。
    """
    return {"companies": list_fundamentals_companies()}


@router.get("/financial-fundamentals", response_model=schemas.FinancialFundamentalsResponse)
def get_financial_fundamentals(
    ticker: str = Query(..., description="対象ティッカー（米国上場）"),
):
    """指定銘柄の財務ファンダメンタルズ年次時系列（売上/粗利/R&D/capex）を返す（SOT-1121 / 候補D）。

    `backend/data/financial-fundamentals.json`（SEC EDGAR XBRL companyconcept 由来。concept差異は
    フォールバックで解決）に基づく。データが無い銘柄は空系列を返す（例外は投げない）。
    """
    return build_company_fundamentals(ticker)


@router.get("/", response_model=schemas.DashboardResponse)
def get_dashboard():
    theme_repo = get_theme_repository()
    company_repo = get_company_repository()
    score_repo = get_score_repository()
    sc_repo = get_supply_chain_repository()
    trend_repo = get_trend_repository()

    # SOT-1168: テーマ情報は list_all() で1回だけ取得し id->theme のマップで解決する。
    # 以前は top_keywords / supply_chain_highlights / alignment の各ループで
    # レコードごとに theme_repo.get_by_id を呼んでおり（供給網は1エッジ×2回）、
    # デプロイ環境(Firestore)では供給網拡張(SOT-1124)で逐次読み取りが数百回に達し
    # タイムアウト→ダッシュボード読み込み失敗を招いていた（/investors/ と同型の N+1）。
    all_themes = theme_repo.list_all()
    theme_by_id = {t["id"]: t for t in all_themes}

    # trending_themes: 注目テーマを前兆スコアの高い順に最大30件表示する
    trending_themes = sorted(
        all_themes,
        key=lambda t: t.get("precursor_score", 0) or 0,
        reverse=True,
    )[:30]

    # top_keywords: top 10 PaperMonthlyCount by mom_change_pct (add theme_name field)
    pm_counts = trend_repo.list_monthly_counts(limit=10)
    top_keywords = []
    for pm in pm_counts:
        theme = theme_by_id.get(pm["theme_id"])
        top_keywords.append({
            "keyword": pm["keyword"],
            "mom_change_pct": pm["mom_change_pct"],
            "theme_name": theme["name"] if theme else "Unknown"
        })

    # notable_companies (SOT-992): 上位5社上限を撤廃し、ティッカーを持つ全注目企業を返す。
    # ダッシュボードの時価総額上位チャートはこのユニバースから top10 を選ぶため、候補を絞らない。
    notable_companies = [
        c for c in company_repo.list_all()
        if (c.get("ticker") if isinstance(c, dict) else getattr(c, "ticker", None))
    ]

    # supply_chain_highlights: all supply chain items ordered by order
    sc_results = sc_repo.list_all()
    supply_chain_highlights = []
    for item in sc_results:
        from_theme = theme_by_id.get(item["from_theme_id"])
        to_theme = theme_by_id.get(item["to_theme_id"])

        res_item = schemas.SupplyChainResponse.model_validate(item)
        res_item.from_theme_name = from_theme["name"] if from_theme else None
        res_item.to_theme_name = to_theme["name"] if to_theme else None
        res_item.from_category = from_theme.get("category") if from_theme else None
        res_item.to_category = to_theme.get("category") if to_theme else None
        supply_chain_highlights.append(res_item)

    # alignment_highlights
    alignment_rows = score_repo.list_top(10)

    high_alignment = []
    paper_only_ids = set()
    for row in alignment_rows:
        theme = theme_by_id.get(row["theme_id"])
        if not theme:
            continue
        if row["score"] >= 30:
            high_alignment.append({"theme": theme, "score": row["score"], "confidence": row["confidence"]})
            paper_only_ids.add(theme["id"])

    paper_only = []
    # Re-using all_themes (一括取得済み・precursor_score 降順)。再取得しない。
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
