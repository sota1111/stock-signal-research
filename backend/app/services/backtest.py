"""株価シグナルの過去データバックテスト（SOT-881 / 親SOT-879）。

同梱株価データ由来の日次終値系列に対して、代表的なテクニカルシグナルを検出し、各シグナル発生時点
から一定期間後（windows 営業日）のフォワードリターンを集計する。シグナルごとに「的中率
（hit_rate）」と「平均リターン（avg_return_pct）」を算出することで、各シグナルが過去データで
どの程度ワークしたかを検証できる。

設計方針:
- pandas / numpy に依存せず、標準ライブラリのみで決定的（deterministic）に計算する。
- 純粋関数として実装し、単体テスト可能にする（market_data からの株価取得とは分離）。
- 入力 prices は [{"date": "YYYY-MM-DD", "close": float}, ...] の昇順リストを想定する。

シグナル定義:
- ゴールデンクロス: 短期SMA が長期SMA を下から上に抜ける（強気）。
- デッドクロス: 短期SMA が長期SMA を上から下に抜ける（弱気）。
- RSI 売られすぎ反転: RSI が下限(既定30)を下から上に抜ける（強気）。
- RSI 買われすぎ反転: RSI が上限(既定70)を上から下に抜ける（弱気）。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

# バックテスト対象シグナルの定義（key, 表示ラベル, 方向）
SIGNAL_DEFS: List[Dict[str, str]] = [
    {"key": "sma_golden_cross", "label": "ゴールデンクロス", "direction": "bullish"},
    {"key": "sma_dead_cross", "label": "デッドクロス", "direction": "bearish"},
    {"key": "rsi_oversold", "label": "RSI 売られすぎ反転", "direction": "bullish"},
    {"key": "rsi_overbought", "label": "RSI 買われすぎ反転", "direction": "bearish"},
]


def sma(values: List[float], period: int) -> List[Optional[float]]:
    """単純移動平均(SMA)を values と同じ長さで返す。period 未満の位置は None。"""
    n = len(values)
    out: List[Optional[float]] = [None] * n
    if period <= 0:
        return out
    running = 0.0
    for i, v in enumerate(values):
        running += v
        if i >= period:
            running -= values[i - period]
        if i >= period - 1:
            out[i] = running / period
    return out


def rsi(values: List[float], period: int = 14) -> List[Optional[float]]:
    """RSI(相対力指数)を values と同じ長さで返す。算出不能な先頭は None。

    period 期間の平均上昇幅/平均下落幅（単純平均）から算出する決定的実装。
    平均下落幅が0の場合は RSI=100 とする。
    """
    n = len(values)
    out: List[Optional[float]] = [None] * n
    if period <= 0 or n <= period:
        return out
    gains = 0.0
    losses = 0.0
    # 最初の period 区間の上昇/下落を集計
    for i in range(1, period + 1):
        diff = values[i] - values[i - 1]
        if diff >= 0:
            gains += diff
        else:
            losses -= diff
    avg_gain = gains / period
    avg_loss = losses / period
    out[period] = _rsi_from_avgs(avg_gain, avg_loss)
    # 以降は Wilder の平滑化で逐次更新
    for i in range(period + 1, n):
        diff = values[i] - values[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = -diff if diff < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        out[i] = _rsi_from_avgs(avg_gain, avg_loss)
    return out


def _rsi_from_avgs(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 2)


def forward_return_pct(closes: List[float], i: int, window: int) -> Optional[float]:
    """index i から window 営業日後のフォワードリターン(%)。算出不能なら None。"""
    j = i + window
    if j >= len(closes):
        return None
    base = closes[i]
    if base == 0:
        return None
    return round((closes[j] - base) / base * 100, 2)


def _crosses_up(prev_a: Optional[float], prev_b: float, cur_a: Optional[float], cur_b: float) -> bool:
    """系列a が系列b を下から上に抜けたか（prev: a<=b, cur: a>b）。"""
    if prev_a is None or cur_a is None:
        return False
    return prev_a <= prev_b and cur_a > cur_b


def _crosses_down(prev_a: Optional[float], prev_b: float, cur_a: Optional[float], cur_b: float) -> bool:
    if prev_a is None or cur_a is None:
        return False
    return prev_a >= prev_b and cur_a < cur_b


def detect_signal_indices(
    closes: List[float],
    *,
    sma_short: int,
    sma_long: int,
    rsi_period: int,
    rsi_lower: float,
    rsi_upper: float,
) -> Dict[str, List[int]]:
    """各シグナルが発生した index のリストを返す。"""
    short = sma(closes, sma_short)
    long = sma(closes, sma_long)
    rsi_vals = rsi(closes, rsi_period)

    indices: Dict[str, List[int]] = {d["key"]: [] for d in SIGNAL_DEFS}
    for i in range(1, len(closes)):
        # SMA クロス（両SMAが算出済みのときのみ）
        if short[i] is not None and long[i] is not None and short[i - 1] is not None and long[i - 1] is not None:
            if _crosses_up(short[i - 1], long[i - 1], short[i], long[i]):
                indices["sma_golden_cross"].append(i)
            elif _crosses_down(short[i - 1], long[i - 1], short[i], long[i]):
                indices["sma_dead_cross"].append(i)
        # RSI クロス
        if rsi_vals[i] is not None and rsi_vals[i - 1] is not None:
            if _crosses_up(rsi_vals[i - 1], rsi_lower, rsi_vals[i], rsi_lower):
                indices["rsi_oversold"].append(i)
            elif _crosses_down(rsi_vals[i - 1], rsi_upper, rsi_vals[i], rsi_upper):
                indices["rsi_overbought"].append(i)
    return indices


def _aggregate(
    closes: List[float], occ_indices: List[int], direction: str, windows: Tuple[int, ...]
) -> List[Dict[str, Any]]:
    """発生 index 群について window 別に的中率/平均リターンを集計する。"""
    window_stats: List[Dict[str, Any]] = []
    for w in windows:
        returns: List[float] = []
        hits = 0
        for i in occ_indices:
            fr = forward_return_pct(closes, i, w)
            if fr is None:
                continue
            returns.append(fr)
            if (direction == "bullish" and fr > 0) or (direction == "bearish" and fr < 0):
                hits += 1
        evaluated = len(returns)
        window_stats.append({
            "window_days": w,
            "evaluated": evaluated,
            "hit_rate": round(hits / evaluated, 4) if evaluated else 0.0,
            "avg_return_pct": round(sum(returns) / evaluated, 2) if evaluated else 0.0,
        })
    return window_stats


def backtest_signals(
    prices: List[Dict[str, Any]],
    *,
    ticker: Optional[str] = None,
    sma_short: int = 25,
    sma_long: int = 75,
    rsi_period: int = 14,
    rsi_lower: float = 30.0,
    rsi_upper: float = 70.0,
    windows: Tuple[int, ...] = (5, 20, 60),
) -> Dict[str, Any]:
    """株価シグナルのバックテスト結果を返す純粋関数。

    Args:
        prices: [{"date","close"}] の昇順リスト（market_data.fetch_stock_data の prices）。
        windows: フォワードリターンを測る営業日数のタプル。

    Returns:
        {ticker, windows, params, total_points, signals:[...]}。
    """
    closes = [float(p["close"]) for p in prices if p.get("close") is not None]
    indices = detect_signal_indices(
        closes,
        sma_short=sma_short,
        sma_long=sma_long,
        rsi_period=rsi_period,
        rsi_lower=rsi_lower,
        rsi_upper=rsi_upper,
    )

    signals: List[Dict[str, Any]] = []
    for d in SIGNAL_DEFS:
        occ = indices[d["key"]]
        signals.append({
            "key": d["key"],
            "label": d["label"],
            "direction": d["direction"],
            "occurrences": len(occ),
            "windows": _aggregate(closes, occ, d["direction"], windows),
        })

    return {
        "ticker": ticker,
        "windows": list(windows),
        "params": {
            "sma_short": sma_short,
            "sma_long": sma_long,
            "rsi_period": rsi_period,
            "rsi_lower": rsi_lower,
            "rsi_upper": rsi_upper,
        },
        "total_points": len(closes),
        "signals": signals,
    }
