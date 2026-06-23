"""SOT-1111 (B): 既存の論文実データから月次トレンドを再集計する純粋関数。

`paper_monthly_counts` は従来3テーマの合成データしか無かった。論文実データ
(collected-papers.json, 100テーマ/約9,560件) から各テーマの月次系列を決定的に再集計し、
全テーマ分の月次トレンドを供給する。外部収集は不要(ローカルデータの再集計のみ)。

副作用なし・決定的。seed (SQLite/Firestore 双方) から利用する。
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple


def _parse_year_month(pub: Any) -> Optional[Tuple[int, int]]:
    """論文の published_at から (year, month) を取り出す。

    許容形式: "YYYY-MM-DD" / "YYYY-MM" / "YYYY/MM" 等。年か月が取れない(年のみ含む)
    場合は None を返す(月次集計には使えないため除外)。
    """
    if not pub or not isinstance(pub, str):
        return None
    s = pub.strip().replace("/", "-")
    parts = s.split("-")
    if len(parts) < 2:
        return None
    try:
        year = int(parts[0])
        month = int(parts[1])
    except (TypeError, ValueError):
        return None
    if not (1 <= month <= 12):
        return None
    if year < 1900 or year > 3000:
        return None
    return year, month


def _ym(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def aggregate_paper_monthly_counts(
    papers: Iterable[Dict[str, Any]],
    from_year: int,
    to_year: int,
) -> List[Dict[str, Any]]:
    """論文(テーマ名+発行年月)から、テーマ別の連続月次系列を集計する。

    入力 `papers`: `seed._load_collected_papers()` の内部形状
        [{"theme": str, "pub": "YYYY-MM(-DD)", ...}, ...]
    各テーマについて from_year-01 〜 to_year-12 の全月(欠損月は count=0)を生成し、
    prev_month_count / prev_year_count / mom_change_pct / yoy_change_pct を付与する。

    返り値(決定的, テーマ名昇順→year_month 昇順):
        [{"theme", "keyword"(=theme), "year_month", "count",
          "prev_month_count", "prev_year_count", "mom_change_pct", "yoy_change_pct"}, ...]

    窓 [from_year, to_year] 内に1件も論文が無いテーマは出力しない(全0系列のノイズを避ける)。
    """
    if to_year < from_year:
        from_year, to_year = to_year, from_year

    # counts[(theme, year, month)] = 件数
    counts: Dict[Tuple[str, int, int], int] = {}
    themes_with_data: set = set()
    for p in papers:
        theme = p.get("theme")
        if not theme:
            continue
        ym = _parse_year_month(p.get("pub"))
        if ym is None:
            continue
        year, month = ym
        if year < from_year or year > to_year:
            continue
        counts[(theme, year, month)] = counts.get((theme, year, month), 0) + 1
        themes_with_data.add(theme)

    out: List[Dict[str, Any]] = []
    months = [(y, m) for y in range(from_year, to_year + 1) for m in range(1, 13)]
    for theme in sorted(themes_with_data):
        prev_month_count = 0
        for (year, month) in months:
            count = counts.get((theme, year, month), 0)
            prev_year_count = counts.get((theme, year - 1, month), 0)
            mom = ((count - prev_month_count) / prev_month_count * 100) if prev_month_count > 0 else 0.0
            yoy = ((count - prev_year_count) / prev_year_count * 100) if prev_year_count > 0 else 0.0
            out.append({
                "theme": theme,
                "keyword": theme,
                "year_month": _ym(year, month),
                "count": count,
                "prev_month_count": prev_month_count,
                "prev_year_count": prev_year_count,
                "mom_change_pct": round(mom, 2),
                "yoy_change_pct": round(yoy, 2),
            })
            prev_month_count = count
    return out
