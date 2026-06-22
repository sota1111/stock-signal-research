"""投資前兆ダッシュボード用の統一シグナルレポート生成サービス。

既存DBに蓄積された論文（arXiv / Semantic Scholar 由来・キー不要）と企業辞書から、
SOT-837 が指定する統一JSON形状を**オフラインで**集計する純粋関数群。

出力形状:
{
  "query": "...",
  "period": {"from_year": 2016, "to_year": 2025},
  "paper_counts_by_year": [{"year": 2016, "count": 12}, ...],
  "surging_keywords": [
    {"keyword": "...", "count_latest_year": 4, "growth_rate": 1.85, "related_paper_ids": [...]}
  ],
  "top_companies": [
    {"rank": 1, "company": "Toyota", "score": 82.5, "related_paper_count": 18,
     "matched_keywords": [...], "market_data_available": true, "evidence": [...]}
  ],
  "supply_chain_graph": {"nodes": [...], "edges": [...]}
}

設計方針:
- 企業推定・サプライチェーン連鎖は完全自動判定ではなく、**根拠（evidence）付きの推定**として扱う。
- 根拠（マッチした論文）が無い企業は出力しない。
- すべて決定的（deterministic）で、単体テスト可能。
"""

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# 1企業あたり evidence に載せる論文数の上限（レスポンス肥大化を防ぐ）
MAX_EVIDENCE_PER_COMPANY = 5
# surging_keyword 1件あたり related_paper_ids の上限
MAX_RELATED_PAPER_IDS = 20
# 急増とみなす成長率の下限（前年比）。これ未満は surging から除外する。
SURGE_GROWTH_THRESHOLD = 1.2


def _as_list(value: Any) -> List[str]:
    """JSON文字列 / リスト / None を str のリストに正規化する。"""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v is not None and str(v).strip()]
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(v) for v in parsed if v is not None and str(v).strip()]
        except (json.JSONDecodeError, ValueError):
            return [s]
        return [str(parsed)]
    return [str(value)]


def _parse_year(published_at: Any) -> Optional[int]:
    """"YYYY-MM-DD" や "YYYY" などから年(int)を抽出する。失敗時は None。"""
    if published_at is None:
        return None
    m = re.search(r"(\d{4})", str(published_at))
    if not m:
        return None
    year = int(m.group(1))
    if 1900 <= year <= 2100:
        return year
    return None


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")
    return s or "unknown"


def _tokenize_query(query: str) -> List[str]:
    return [t for t in re.split(r"\s+", str(query).lower().strip()) if t]


def _paper_haystack(paper: Dict[str, Any]) -> str:
    parts = [
        str(paper.get("title") or ""),
        str(paper.get("abstract") or ""),
    ]
    parts.extend(_as_list(paper.get("extracted_keywords")))
    return " ".join(parts).lower()


def _matches_query(paper: Dict[str, Any], tokens: List[str]) -> bool:
    """クエリの全トークンが論文の title/abstract/keywords に含まれれば一致。

    トークンが空（クエリ未指定）の場合は全件一致とする。
    """
    if not tokens:
        return True
    haystack = _paper_haystack(paper)
    return all(tok in haystack for tok in tokens)


# テーマ名のトークン化で無視する汎用語（どの論文にも出やすくテーマ識別に役立たない）。
_THEME_STOPWORDS = {
    "and", "the", "for", "with", "from", "into", "use", "using", "based",
    "physical", "model", "models", "system", "systems", "technology", "tech",
}


def _theme_tokens(name: str, description: str = "") -> List[str]:
    """テーマ名＋説明から、論文照合に使う識別トークン（小文字）を抽出する。

    記号（スラッシュ等）で分割し、3文字未満と汎用ストップワードを除外する。
    """
    raw = re.split(r"[^a-z0-9]+", f"{name} {description}".lower())
    return [t for t in raw if len(t) >= 3 and t not in _THEME_STOPWORDS]


def _paper_matches_theme(paper: Dict[str, Any], tokens: List[str]) -> bool:
    """テーマのトークンが論文の title/abstract/keywords に1つでも含まれれば一致。

    テーマ名は複合語（例 "NVIDIA / GPU / Physical AI"）が多く、全トークン一致は厳しすぎる。
    ここでは any（OR）一致の推定で、根拠（マッチ語）付きのテーマ別グルーピングを行う。
    """
    if not tokens:
        return False
    hay = _paper_haystack(paper)
    return any(tok in hay for tok in tokens)


def aggregate_theme_citations(
    papers: List[Dict[str, Any]],
    themes: List[Dict[str, Any]],
    top_n: int = 100,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """テーマごとに「引用数上位 top_n 論文」と「その総引用数」を集計する純粋関数。

    各テーマについて、テーマ名トークンに一致する論文を citation_count 降順で並べ、上位
    top_n 本を取り出して link/概要/引用数を返す。total_citations はその上位論文の引用数合計。
    ダッシュボードの新指標「テーマ別 引用数上位100論文の総引用数」の元データ。

    Args:
        papers: 論文 dict のリスト（title, abstract, extracted_keywords, url,
            citation_count を想定。値はJSON文字列でも可）。
        themes: テーマ dict のリスト（id, name, description を想定）。
        top_n: 1テーマあたり集計する上位論文数（既定100）。
    """
    now = now or datetime.now(timezone.utc)
    theme_results: List[Dict[str, Any]] = []

    for theme in themes or []:
        name = str(theme.get("name") or "")
        tokens = _theme_tokens(name, str(theme.get("description") or ""))
        matched = [p for p in papers if _paper_matches_theme(p, tokens)]
        ranked = sorted(
            matched,
            key=lambda x: int(x.get("citation_count") or 0),
            reverse=True,
        )[:top_n]
        total = sum(int(x.get("citation_count") or 0) for x in ranked)
        theme_results.append({
            "theme_id": theme.get("id"),
            "theme_name": name,
            "total_citations": total,
            "paper_count": len(ranked),
            "top_papers": [
                {
                    "paper_id": str(x.get("paper_id") or x.get("id") or ""),
                    "title": str(x.get("title") or ""),
                    "url": str(x.get("url") or ""),
                    "abstract": str(x.get("abstract") or ""),
                    "citation_count": int(x.get("citation_count") or 0),
                }
                for x in ranked
            ],
        })

    theme_results.sort(key=lambda r: r["total_citations"], reverse=True)

    return {
        "top_n": top_n,
        "total_citations": sum(r["total_citations"] for r in theme_results),
        "themes": theme_results,
        "generated_at": now.isoformat(),
    }


def aggregate_theme_citation_matrix(
    papers: List[Dict[str, Any]],
    themes: List[Dict[str, Any]],
    years: int = 10,
    from_year: Optional[int] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """テーマ×年の引用数合計マトリクスを集計する純粋関数。

    行=テーマ、列=直近 ``years`` 年（現在の年で終わる連続年）、セル=その
    テーマ・その年の論文 ``citation_count`` 合計。ダッシュボードの「テーマごとの
    引用数合計を行列形式で表示」要件（SOT-944）の元データ。外部APIキー不要。

    Args:
        papers: 論文 dict のリスト（title, abstract, citation_count, published_at を想定）。
        themes: テーマ dict のリスト（id, name, description を想定）。
        years: 列に表示する直近の年数（既定10, from_year 未指定時のみ使用）。
        from_year: 指定すると列を from_year..現在年にする（SOT-1081 要件①: 2009起点）。
    """
    now = now or datetime.now(timezone.utc)
    current_year = now.year
    if from_year is not None:
        start = min(int(from_year), current_year)
        year_columns = list(range(start, current_year + 1))
    else:
        span = max(1, int(years))
        year_columns = list(range(current_year - span + 1, current_year + 1))
    year_index = {y: i for i, y in enumerate(year_columns)}

    rows: List[Dict[str, Any]] = []
    column_totals = [0] * len(year_columns)

    for theme in themes or []:
        name = str(theme.get("name") or "")
        tokens = _theme_tokens(name, str(theme.get("description") or ""))
        matched = [p for p in papers if _paper_matches_theme(p, tokens)]

        cells = [0] * len(year_columns)
        for p in matched:
            year = _parse_year(p.get("published_at"))
            if year is None or year not in year_index:
                continue
            cells[year_index[year]] += int(p.get("citation_count") or 0)

        total = sum(cells)
        for i, v in enumerate(cells):
            column_totals[i] += v

        rows.append({
            "theme_id": theme.get("id"),
            "theme_name": name,
            "total": total,
            "cells": cells,
        })

    rows.sort(key=lambda r: r["total"], reverse=True)

    return {
        "years": year_columns,
        "rows": rows,
        "column_totals": column_totals,
        "grand_total": sum(column_totals),
        "generated_at": now.isoformat(),
    }


def aggregate_category_paper_averages(
    papers: List[Dict[str, Any]],
    themes: List[Dict[str, Any]],
    from_year: Optional[int] = None,
    to_year: Optional[int] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """カテゴリグループ（Theme.category）ごとの「テーマあたり平均論文数」を年次で集計する純粋関数。

    「単純に論文数が増えたか」をカテゴリ規模に依らず比較できるよう、各カテゴリの年内論文数を
    そのカテゴリに属するテーマ数で割った平均（=テーマあたり論文数）を年別に返す（SOT-1049）。

    論文は ``theme_id`` → テーマ → ``category`` で各カテゴリに割り当てる（決定的）。``theme_id``
    が無い/未知テーマの論文、年が解釈できない論文は除外する。0件テーマもカテゴリのテーマ数
    （=分母）に含めるため、テーマ数が多いだけのカテゴリが過大評価されない。

    Args:
        papers: 論文 dict のリスト（theme_id, published_at を想定）。
        themes: テーマ dict のリスト（id, category を想定）。
        from_year / to_year: 集計年範囲。未指定なら全論文の年の min/max。
    """
    now = now or datetime.now(timezone.utc)

    # category -> テーマ数（分母）, theme_id -> category（論文の割り当て）
    theme_count_by_category: Dict[str, int] = {}
    category_by_theme_id: Dict[str, str] = {}
    for theme in themes or []:
        category = str(theme.get("category") or "").strip()
        if not category:
            continue
        theme_count_by_category[category] = theme_count_by_category.get(category, 0) + 1
        tid = theme.get("id")
        if tid is not None:
            category_by_theme_id[str(tid)] = category

    # 論文を (category, year) にバケットしつつ、年範囲が未指定なら実データから min/max を求める。
    counts: Dict[str, Dict[int, int]] = {}
    observed_years: List[int] = []
    for p in papers or []:
        tid = p.get("theme_id")
        if tid is None:
            continue
        category = category_by_theme_id.get(str(tid))
        if category is None:
            continue
        year = _parse_year(p.get("published_at"))
        if year is None:
            continue
        observed_years.append(year)
        counts.setdefault(category, {}).setdefault(year, 0)
        counts[category][year] += 1

    if from_year is not None and to_year is not None and from_year > to_year:
        from_year, to_year = to_year, from_year
    resolved_from = from_year if from_year is not None else (min(observed_years) if observed_years else now.year)
    resolved_to = to_year if to_year is not None else (max(observed_years) if observed_years else now.year)
    year_columns = list(range(resolved_from, resolved_to + 1))

    categories: List[Dict[str, Any]] = []
    for category, theme_count in theme_count_by_category.items():
        year_counts = counts.get(category, {})
        total_papers = sum(
            c for y, c in year_counts.items() if resolved_from <= y <= resolved_to
        )
        averages = [
            round(year_counts.get(y, 0) / theme_count, 2) if theme_count else 0.0
            for y in year_columns
        ]
        categories.append({
            "category": category,
            "theme_count": theme_count,
            "averages": averages,
            "total_papers": total_papers,
        })

    categories.sort(key=lambda c: c["total_papers"], reverse=True)

    return {
        "years": year_columns,
        "categories": categories,
        "generated_at": now.isoformat(),
    }


def aggregate_category_paper_counts(
    papers: List[Dict[str, Any]],
    themes: List[Dict[str, Any]],
    category: str,
    from_year: Optional[int] = None,
    to_year: Optional[int] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """指定した大カテゴリ（Theme.category）内の「テーマ別 年次論文数」を集計する純粋関数。

    SOT-1081 要件③④: 大カテゴリを選択すると、その中のカテゴリ（=テーマ）ごとの年別論文数を
    折れ線で表示するためのデータ。論文は ``theme_id`` でテーマに割り当て（決定的）、年が
    解釈できない論文は除外する。論文が1件以上あるテーマのみ系列に含め、総数の多い順に並べる。

    Args:
        papers: 論文 dict のリスト（theme_id, published_at を想定）。
        themes: テーマ dict のリスト（id, name, category を想定）。
        category: 対象の大カテゴリ（Theme.category）。
        from_year / to_year: 集計年範囲。from 未指定なら観測最小年、to 未指定なら現在年。
    """
    now = now or datetime.now(timezone.utc)
    target = str(category or "").strip()

    # 対象大カテゴリ内のテーマ（id→name）
    theme_name_by_id: Dict[str, str] = {}
    for theme in themes or []:
        if str(theme.get("category") or "").strip() != target:
            continue
        tid = theme.get("id")
        if tid is not None:
            theme_name_by_id[str(tid)] = str(theme.get("name") or "")

    # 論文を (theme_id, year) にバケットしつつ観測年を集める
    counts: Dict[str, Dict[int, int]] = {}
    observed_years: List[int] = []
    for p in papers or []:
        tid = p.get("theme_id")
        if tid is None or str(tid) not in theme_name_by_id:
            continue
        year = _parse_year(p.get("published_at"))
        if year is None:
            continue
        observed_years.append(year)
        counts.setdefault(str(tid), {}).setdefault(year, 0)
        counts[str(tid)][year] += 1

    if from_year is not None and to_year is not None and from_year > to_year:
        from_year, to_year = to_year, from_year
    resolved_from = from_year if from_year is not None else (min(observed_years) if observed_years else now.year)
    resolved_to = to_year if to_year is not None else now.year
    year_columns = list(range(resolved_from, resolved_to + 1))

    series: List[Dict[str, Any]] = []
    for tid, name in theme_name_by_id.items():
        year_counts = counts.get(tid, {})
        cells = [year_counts.get(y, 0) for y in year_columns]
        total = sum(cells)
        if total <= 0:
            continue
        series.append({
            "theme_id": tid,
            "theme_name": name,
            "total": total,
            "counts": cells,
        })

    series.sort(key=lambda s: s["total"], reverse=True)

    return {
        "category": target,
        "years": year_columns,
        "series": series,
        "generated_at": now.isoformat(),
    }


def generate_signal_report(
    query: str,
    papers: List[Dict[str, Any]],
    companies: Optional[List[Dict[str, Any]]] = None,
    from_year: Optional[int] = None,
    to_year: Optional[int] = None,
    top_n: int = 5,
    surge_top_n: int = 10,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """統一シグナルレポートJSONを生成する純粋関数。

    Args:
        query: 集計対象テーマ/キーワード。
        papers: 論文 dict のリスト（paper_id, title, abstract, authors,
            extracted_keywords, published_at を想定。値はJSON文字列でも可）。
        companies: 企業辞書 dict のリスト（name, ticker を想定）。
        from_year / to_year: 集計期間。未指定なら直近10年（to_year=現在年）。
        top_n: 注目企業の最大件数。
        surge_top_n: 急増キーワードの最大件数。
    """
    companies = companies or []
    now = now or datetime.now(timezone.utc)

    resolved_to = to_year if to_year is not None else now.year
    resolved_from = from_year if from_year is not None else resolved_to - 9
    if resolved_from > resolved_to:
        resolved_from, resolved_to = resolved_to, resolved_from

    tokens = _tokenize_query(query)

    # --- 1) クエリ一致 & 期間内の論文を抽出 ---
    matched: List[Dict[str, Any]] = []
    for p in papers:
        if not _matches_query(p, tokens):
            continue
        year = _parse_year(p.get("published_at"))
        if year is None or year < resolved_from or year > resolved_to:
            continue
        matched.append({**p, "_year": year})

    # --- 2) paper_counts_by_year（0件の年も含める） ---
    counts_by_year = {y: 0 for y in range(resolved_from, resolved_to + 1)}
    for p in matched:
        counts_by_year[p["_year"]] += 1
    paper_counts_by_year = [
        {"year": y, "count": counts_by_year[y]}
        for y in range(resolved_from, resolved_to + 1)
    ]

    # --- 3) surging_keywords ---
    surging_keywords = _compute_surging_keywords(matched, resolved_to, surge_top_n)
    surge_keyword_set = {sk["keyword"] for sk in surging_keywords}

    # --- 4) top_companies ---
    top_companies = _compute_top_companies(
        matched, companies, surge_keyword_set, top_n
    )

    # --- 5) supply_chain_graph ---
    supply_chain_graph = _build_supply_chain_graph(top_companies)

    return {
        "query": query,
        "period": {"from_year": resolved_from, "to_year": resolved_to},
        "paper_counts_by_year": paper_counts_by_year,
        "surging_keywords": surging_keywords,
        "top_companies": top_companies,
        "supply_chain_graph": supply_chain_graph,
        "paper_total": len(matched),
        "generated_at": now.isoformat(),
    }


def _compute_surging_keywords(
    matched: List[Dict[str, Any]], latest_year: int, surge_top_n: int
) -> List[Dict[str, Any]]:
    """直近年(latest_year)と前年(latest_year-1)を比較し、成長率の高いキーワードを返す。"""
    # keyword -> year -> set(paper_id)
    by_keyword: Dict[str, Dict[int, set]] = {}
    for p in matched:
        year = p["_year"]
        pid = p.get("paper_id") or p.get("id") or ""
        for kw in _as_list(p.get("extracted_keywords")):
            norm = kw.strip().lower()
            if not norm:
                continue
            by_keyword.setdefault(norm, {}).setdefault(year, set()).add(pid)

    results = []
    prev_year = latest_year - 1
    for kw, year_map in by_keyword.items():
        latest_ids = year_map.get(latest_year, set())
        count_latest = len(latest_ids)
        if count_latest == 0:
            continue
        count_prev = len(year_map.get(prev_year, set()))
        if count_prev > 0:
            growth_rate = round(count_latest / count_prev, 2)
        else:
            # 前年0件からの新規出現は急増とみなす（件数をそのまま成長指標に）
            growth_rate = float(count_latest)
        if growth_rate < SURGE_GROWTH_THRESHOLD:
            continue
        results.append({
            "keyword": kw,
            "count_latest_year": count_latest,
            "growth_rate": growth_rate,
            "related_paper_ids": sorted(latest_ids)[:MAX_RELATED_PAPER_IDS],
        })

    results.sort(key=lambda r: (r["growth_rate"], r["count_latest_year"]), reverse=True)
    return results[:surge_top_n]


def _company_haystack(paper: Dict[str, Any]) -> str:
    parts = [
        str(paper.get("title") or ""),
        str(paper.get("abstract") or ""),
    ]
    parts.extend(_as_list(paper.get("authors")))
    return " ".join(parts).lower()


def _compute_top_companies(
    matched: List[Dict[str, Any]],
    companies: List[Dict[str, Any]],
    surge_keyword_set: set,
    top_n: int,
) -> List[Dict[str, Any]]:
    """企業辞書を論文(title/abstract/authors)に突き合わせ、根拠付きでスコアリングする。

    根拠（マッチ論文）が無い企業は除外する。
    """
    scored = []
    for company in companies:
        name = str(company.get("name") or "").strip()
        if not name:
            continue
        name_lc = name.lower()
        related = []
        matched_keywords: set = set()
        for p in matched:
            if name_lc in _company_haystack(p):
                related.append(p)
                for kw in _as_list(p.get("extracted_keywords")):
                    norm = kw.strip().lower()
                    if norm in surge_keyword_set:
                        matched_keywords.add(norm)
        related_count = len(related)
        if related_count == 0:
            # 根拠の無い企業名は表示しない
            continue
        # 決定的スコア: 関連論文数 * 10 + 急増キーワード一致数 * 5
        score = round(related_count * 10.0 + len(matched_keywords) * 5.0, 2)
        evidence = [
            {"paper_id": p.get("paper_id") or p.get("id") or "", "title": p.get("title") or ""}
            for p in related[:MAX_EVIDENCE_PER_COMPANY]
        ]
        scored.append({
            "company": name,
            "ticker": company.get("ticker"),
            "score": score,
            "related_paper_count": related_count,
            "matched_keywords": sorted(matched_keywords),
            "market_data_available": bool(company.get("ticker")),
            "evidence": evidence,
        })

    scored.sort(key=lambda c: (c["score"], c["related_paper_count"]), reverse=True)
    top = scored[:top_n]
    for i, c in enumerate(top, start=1):
        c["rank"] = i
    # rank を先頭に揃えた dict を返す
    return [
        {
            "rank": c["rank"],
            "company": c["company"],
            "score": c["score"],
            "related_paper_count": c["related_paper_count"],
            "matched_keywords": c["matched_keywords"],
            "market_data_available": c["market_data_available"],
            "evidence": c["evidence"],
        }
        for c in top
    ]


def _build_supply_chain_graph(top_companies: List[Dict[str, Any]]) -> Dict[str, Any]:
    """注目企業と急増キーワード(matched_keywords)から、根拠付きのノード/エッジを構築する。

    - company ノード: 注目企業
    - keyword ノード: 注目企業に紐づく急増キーワード（材料・技術等の手掛かり）
    - edge: keyword -> company（relation="researched_by_or_related_to", evidence付き）
    """
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    seen_nodes: set = set()

    def add_node(node_id: str, node_type: str, label: str) -> None:
        if node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        nodes.append({"id": node_id, "type": node_type, "label": label})

    for c in top_companies:
        company_id = f"company:{_slug(c['company'])}"
        add_node(company_id, "company", c["company"])
        evidence_ids = [e.get("paper_id", "") for e in c.get("evidence", []) if e.get("paper_id")]
        for kw in c.get("matched_keywords", []):
            kw_id = f"keyword:{_slug(kw)}"
            add_node(kw_id, "keyword", kw)
            edges.append({
                "source": kw_id,
                "target": company_id,
                "relation": "researched_by_or_related_to",
                "evidence": evidence_ids,
            })

    return {"nodes": nodes, "edges": edges}
