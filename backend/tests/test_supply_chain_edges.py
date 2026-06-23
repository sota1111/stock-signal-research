"""SOT-1124: 100テーマ横断 supply chain edge seed の整合性テスト。"""
import json
import os

from app import seed
from app.services.supply_chain_validation import (
    VALID_RELATION_TYPES,
    validate_supply_chain_edges,
)

_EDGES_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "supply-chain-edges.json"
)


def _load_raw_edges():
    with open(_EDGES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)["edges"]


def _theme_name_to_category():
    return {t["name"]: t["category"] for t in seed._DASHBOARD_THEMES}


def test_edges_file_exists_and_has_many_edges():
    edges = _load_raw_edges()
    # 6本固定からの拡充。100テーマ横断として十分な本数があること。
    assert len(edges) >= 30


def test_all_edges_reference_known_themes():
    edges = _load_raw_edges()
    valid_names = {t["name"] for t in seed._DASHBOARD_THEMES}
    errors = validate_supply_chain_edges(edges, valid_names)
    assert errors == [], f"edge seed validation errors: {errors}"


def test_relation_type_and_confidence_valid():
    edges = _load_raw_edges()
    for e in edges:
        assert e["relation_type"] in VALID_RELATION_TYPES
        assert 0.0 <= float(e["confidence"]) <= 1.0


def test_all_categories_appear_in_edges():
    """13大カテゴリ(実際の全カテゴリ)すべてが少なくとも1テーマ edge に登場すること。"""
    edges = _load_raw_edges()
    name_to_cat = _theme_name_to_category()
    used = set()
    for e in edges:
        used.add(name_to_cat[e["from"]])
        used.add(name_to_cat[e["to"]])
    all_cats = set(name_to_cat.values())
    assert all_cats == used, f"categories not covered by edges: {all_cats - used}"


def test_validate_detects_unknown_theme():
    bad = [
        {"from": "nonexistent theme", "to": "HBM", "relation_type": "supplies", "confidence": 0.5},
    ]
    errors = validate_supply_chain_edges(bad, {"HBM"})
    assert any("未知テーマ" in e for e in errors)


def test_validate_detects_self_loop_and_bad_fields():
    bad = [
        {"from": "HBM", "to": "HBM", "relation_type": "weird", "confidence": 2.0},
    ]
    errors = validate_supply_chain_edges(bad, {"HBM"})
    assert any("自己ループ" in e for e in errors)
    assert any("relation_type" in e for e in errors)
    assert any("confidence" in e for e in errors)


def test_loader_returns_structured_edges():
    edges = seed._load_supply_chain_edges()
    assert len(edges) >= 30
    sample = edges[0]
    for key in ("from", "to", "rel", "order", "relation_type", "confidence", "evidence"):
        assert key in sample
    assert isinstance(sample["evidence"], list)
