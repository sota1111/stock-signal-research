"""SOT-1124: サプライチェーン edge seed の整合性検証。

100テーマ横断の構造化 supply chain edge が、実在テーマだけを参照し、関係タイプ/信頼度が
妥当であることを検証する。seed 投入時およびテストから利用する。
"""
from typing import Any, Dict, Iterable, List

# 関係タイプ enum（向きは from -> to）
VALID_RELATION_TYPES = {
    "supplies",      # from が to に供給する（部材/技術）
    "enables",       # from が to を可能にする
    "depends_on",    # from が to に依存する
    "complements",   # 相互補完
    "competes",      # 競合/代替
}


def validate_supply_chain_edges(
    edges: Iterable[Dict[str, Any]],
    valid_theme_names: Iterable[str],
) -> List[str]:
    """edge list を検証し、エラーメッセージの list を返す（空なら正常）。

    各 edge は dict で、テーマ名は "from"/"to"（seed 形式）または
    "from_theme"/"to_theme" のいずれかで与えられる。
    """
    valid = set(valid_theme_names)
    errors: List[str] = []

    for i, edge in enumerate(edges):
        frm = edge.get("from") or edge.get("from_theme")
        to = edge.get("to") or edge.get("to_theme")
        label = f"edge[{i}] {frm!r}->{to!r}"

        if not frm or not to:
            errors.append(f"{label}: from/to が空")
            continue
        if frm not in valid:
            errors.append(f"{label}: 未知テーマ参照 from={frm!r}")
        if to not in valid:
            errors.append(f"{label}: 未知テーマ参照 to={to!r}")
        if frm == to:
            errors.append(f"{label}: 自己ループ（from == to）")

        rel = edge.get("relation_type")
        if rel is not None and rel not in VALID_RELATION_TYPES:
            errors.append(f"{label}: 不正な relation_type={rel!r}")

        conf = edge.get("confidence")
        if conf is not None:
            try:
                conf_f = float(conf)
            except (TypeError, ValueError):
                errors.append(f"{label}: confidence が数値でない={conf!r}")
            else:
                if not (0.0 <= conf_f <= 1.0):
                    errors.append(f"{label}: confidence が範囲外 [0,1]={conf_f}")

    return errors
