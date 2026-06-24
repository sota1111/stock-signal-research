"""SOT-1111(B): 論文月次トレンド再集計 純粋関数のテスト。"""
from app.aggregations import aggregate_paper_monthly_counts, _parse_year_month


def test_parse_year_month_formats():
    assert _parse_year_month("2024-03-15") == (2024, 3)
    assert _parse_year_month("2024-03") == (2024, 3)
    assert _parse_year_month("2024/03") == (2024, 3)
    # 月が取れない/不正なものは None
    assert _parse_year_month("2024") is None
    assert _parse_year_month("2024-13") is None
    assert _parse_year_month("") is None
    assert _parse_year_month(None) is None
    assert _parse_year_month("not-a-date") is None


def test_aggregate_counts_and_series_continuity():
    papers = [
        {"theme": "Alpha", "pub": "2023-01-10"},
        {"theme": "Alpha", "pub": "2023-01-20"},
        {"theme": "Alpha", "pub": "2023-02-05"},
        {"theme": "Alpha", "pub": "2024-01-01"},  # 翌年同月(yoy 比較用)
        {"theme": "Beta", "pub": "2023-06-01"},
        {"theme": "Beta", "pub": "bad-date"},      # 除外
        {"theme": None, "pub": "2023-01-01"},      # 除外
    ]
    rows = aggregate_paper_monthly_counts(papers, 2023, 2024)

    # 窓内に論文があるテーマのみ(Alpha, Beta)。
    themes = sorted({r["theme"] for r in rows})
    assert themes == ["Alpha", "Beta"]
    # 末尾の空月はトリムされる。Alpha は最終データ月=2024-01 で終端(2023-01..2024-01=13ヶ月)、
    # Beta は最終データ月=2023-06 で終端(2023-01..2023-06=6ヶ月)。
    alpha_months = [r["year_month"] for r in rows if r["theme"] == "Alpha"]
    beta_months = [r["year_month"] for r in rows if r["theme"] == "Beta"]
    assert alpha_months[0] == "2023-01" and alpha_months[-1] == "2024-01"
    assert len(alpha_months) == 13
    assert beta_months[0] == "2023-01" and beta_months[-1] == "2023-06"
    assert len(beta_months) == 6
    # 未来側・データ無しの末尾月は存在しない
    assert ("Alpha", "2024-02") not in {(r["theme"], r["year_month"]) for r in rows}

    by_key = {(r["theme"], r["year_month"]): r for r in rows}
    # カウント
    assert by_key[("Alpha", "2023-01")]["count"] == 2
    assert by_key[("Alpha", "2023-02")]["count"] == 1
    assert by_key[("Alpha", "2023-03")]["count"] == 0  # 欠損月は0埋め
    assert by_key[("Alpha", "2024-01")]["count"] == 1
    # keyword はテーマ名
    assert by_key[("Alpha", "2023-01")]["keyword"] == "Alpha"
    # prev_month_count: 2023-02 の前月=2023-01 の 2
    assert by_key[("Alpha", "2023-02")]["prev_month_count"] == 2
    # mom: (1-2)/2*100 = -50.0
    assert by_key[("Alpha", "2023-02")]["mom_change_pct"] == -50.0
    # prev_year_count: 2024-01 の12ヶ月前=2023-01 の 2
    assert by_key[("Alpha", "2024-01")]["prev_year_count"] == 2
    # yoy: (1-2)/2*100 = -50.0
    assert by_key[("Alpha", "2024-01")]["yoy_change_pct"] == -50.0
    # 窓先頭は prev_month/prev_year ともに0
    assert by_key[("Alpha", "2023-01")]["prev_month_count"] == 0
    assert by_key[("Alpha", "2023-01")]["prev_year_count"] == 0


def test_aggregate_is_deterministic_and_window_bounded():
    papers = [
        {"theme": "Z", "pub": "2010-05-01"},   # 窓外
        {"theme": "Z", "pub": "2023-05-01"},   # 窓内
    ]
    r1 = aggregate_paper_monthly_counts(papers, 2022, 2023)
    r2 = aggregate_paper_monthly_counts(papers, 2022, 2023)
    assert r1 == r2  # 決定的
    # 窓外(2010)は集計されない
    assert all(not r["year_month"].startswith("2010") for r in r1)
    total = sum(r["count"] for r in r1)
    assert total == 1


def test_trailing_empty_months_trimmed_inner_zeros_kept():
    # 先頭・中間の0月は連続性のため残し、末尾の連続0月のみ落とす。
    papers = [
        {"theme": "G", "pub": "2022-03-01"},  # 中間にデータ
        {"theme": "G", "pub": "2022-05-01"},  # 2022-04 は中間の0月(残す)
    ]
    rows = aggregate_paper_monthly_counts(papers, 2022, 2024)
    months = [r["year_month"] for r in rows]
    # 系列は窓先頭(2022-01)から最終データ月(2022-05)まで。以降(2022-06..2024-12)はトリム。
    assert months[0] == "2022-01"
    assert months[-1] == "2022-05"
    by_key = {r["year_month"]: r for r in rows}
    assert by_key["2022-04"]["count"] == 0  # 中間の0月は保持
    assert "2022-06" not in by_key            # 末尾の0月はトリム


def test_empty_input_returns_empty():
    assert aggregate_paper_monthly_counts([], 2022, 2023) == []
