from app.services.backtest import (
    sma,
    rsi,
    forward_return_pct,
    detect_signal_indices,
    backtest_signals,
)


def _prices(closes):
    return [{"date": f"2020-01-{i + 1:02d}", "close": c} for i, c in enumerate(closes)]


def test_sma_basic():
    assert sma([1, 2, 3, 4], 2) == [None, 1.5, 2.5, 3.5]
    # period 未満は全て None
    assert sma([5], 2) == [None]
    # period<=0 は全て None
    assert sma([1, 2, 3], 0) == [None, None, None]


def test_rsi_all_gains_is_100():
    vals = list(range(1, 20))  # 単調増加 → 下落なし → RSI=100
    out = rsi(vals, 14)
    # 先頭 period 個は算出不能
    assert out[:14] == [None] * 14
    assert out[14] == 100.0
    assert out[-1] == 100.0


def test_rsi_short_series_returns_none():
    assert rsi([1, 2, 3], 14) == [None, None, None]


def test_forward_return_pct():
    closes = [100.0, 110.0, 90.0]
    assert forward_return_pct(closes, 0, 1) == 10.0
    assert forward_return_pct(closes, 0, 2) == -10.0
    # window が範囲外なら None
    assert forward_return_pct(closes, 2, 1) is None
    # base が 0 なら None
    assert forward_return_pct([0.0, 5.0], 0, 1) is None


def test_detect_golden_cross():
    # 短期2/長期3で idx5 にゴールデンクロスが1回発生する系列
    closes = [10, 9, 8, 7, 8, 10, 12, 14, 16, 18]
    idx = detect_signal_indices(
        closes, sma_short=2, sma_long=3, rsi_period=14, rsi_lower=30, rsi_upper=70
    )
    assert idx["sma_golden_cross"] == [5]
    assert idx["sma_dead_cross"] == []


def test_backtest_signals_aggregates_hit_rate_and_return():
    closes = [10, 9, 8, 7, 8, 10, 12, 14, 16, 18]
    result = backtest_signals(
        _prices(closes),
        ticker="TEST",
        sma_short=2,
        sma_long=3,
        windows=(1,),
    )
    assert result["ticker"] == "TEST"
    assert result["total_points"] == 10
    golden = next(s for s in result["signals"] if s["key"] == "sma_golden_cross")
    assert golden["occurrences"] == 1
    w = golden["windows"][0]
    assert w["window_days"] == 1
    assert w["evaluated"] == 1
    # idx5(=10) → idx6(=12): +20%、強気シグナルなので的中
    assert w["hit_rate"] == 1.0
    assert w["avg_return_pct"] == 20.0


def test_backtest_signals_empty_prices():
    result = backtest_signals([], ticker="EMPTY")
    assert result["total_points"] == 0
    assert all(s["occurrences"] == 0 for s in result["signals"])
    # 4種類のシグナルが必ず返る
    assert {s["key"] for s in result["signals"]} == {
        "sma_golden_cross",
        "sma_dead_cross",
        "rsi_oversold",
        "rsi_overbought",
    }
