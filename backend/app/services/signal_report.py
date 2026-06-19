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
