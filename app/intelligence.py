"""Explainable market intelligence and conservative OHLCV backtesting."""
from __future__ import annotations

from math import isfinite
from statistics import mean, pstdev
from typing import Any


def _valid_candles(candles: list[dict[str, Any]]) -> list[dict[str, float]]:
    clean = []
    for c in candles or []:
        try:
            row = {k: float(c[k]) for k in ("open", "high", "low", "close", "volume")}
            if not all(isfinite(v) for v in row.values()):
                continue
            if min(row["open"], row["high"], row["low"], row["close"]) <= 0 or row["volume"] < 0:
                continue
            if row["high"] < max(row["open"], row["close"], row["low"]) or row["low"] > min(row["open"], row["close"], row["high"]):
                continue
            clean.append(row)
        except (KeyError, TypeError, ValueError):
            continue
    return clean


def _ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    value = mean(values[:period])
    alpha = 2 / (period + 1)
    for item in values[period:]:
        value += alpha * (item - value)
    return value


def analyze_market(candles: list[dict[str, Any]]) -> dict[str, Any]:
    rows = _valid_candles(candles)
    if len(rows) < 60:
        return {"status": "insufficient_data", "candles": len(rows), "regime": "unknown", "score": 0, "direction": "NEUTRAL", "signals": []}
    closes = [r["close"] for r in rows]
    volumes = [r["volume"] for r in rows]
    e20, e50 = _ema(closes, 20), _ema(closes, 50)
    returns = [(closes[i] / closes[i-1] - 1) for i in range(1, len(closes)) if closes[i-1] > 0]
    volatility = pstdev(returns[-20:]) if len(returns) >= 20 else 0.0
    avg_volume = mean(volumes[-21:-1]) if len(volumes) >= 21 else 0.0
    volume_ratio = volumes[-1] / avg_volume if avg_volume > 0 else 0.0
    recent_high, recent_low = max(r["high"] for r in rows[-20:-1]), min(r["low"] for r in rows[-20:-1])
    last = closes[-1]
    trend_up = bool(e20 and e50 and e20 > e50 and last > e20)
    trend_down = bool(e20 and e50 and e20 < e50 and last < e20)
    breakout_up, breakout_down = last > recent_high, last < recent_low
    score = 50
    reasons = []
    if trend_up:
        score += 20; reasons.append("Цена выше EMA20, EMA20 выше EMA50")
    elif trend_down:
        score -= 20; reasons.append("Цена ниже EMA20, EMA20 ниже EMA50")
    if breakout_up:
        score += 15; reasons.append("Пробой максимума последних 19 свечей")
    elif breakout_down:
        score -= 15; reasons.append("Пробой минимума последних 19 свечей")
    if volume_ratio >= 1.5:
        score += 8 if last >= rows[-2]["close"] else -8
        reasons.append(f"Объём выше среднего в {volume_ratio:.2f} раза")
    score = max(0, min(100, score))
    regime = "trend" if abs((e20 or last) - (e50 or last)) / last > 0.002 else "range"
    if volatility > 0.035:
        regime = "high_volatility"
    direction = "BUY" if score >= 65 else "SELL" if score <= 35 else "NEUTRAL"
    return {"status": "ok", "candles": len(rows), "price": last, "ema20": e20, "ema50": e50,
            "volatility_20": volatility, "volume_ratio": volume_ratio, "regime": regime,
            "direction": direction, "score": score, "signals": reasons,
            "note": "Индикаторная оценка, не вероятность прибыли и не торговая рекомендация."}


def backtest(candles: list[dict[str, Any]], *, fee_rate: float = 0.001,
             slippage_rate: float = 0.0005, train_fraction: float = 0.70) -> dict[str, Any]:
    """Simple EMA trend-following close-to-close test with a chronological holdout.

    Signal at candle close is executed at the next candle open; fees and slippage
    are charged on both sides. No leverage, pyramiding, or future data leakage.
    """
    rows = _valid_candles(candles)
    if len(rows) < 100:
        return {"status": "insufficient_data", "candles": len(rows), "trades": 0}
    split = max(70, min(len(rows)-20, int(len(rows) * train_fraction)))
    result = {}
    for label, start, end in (("in_sample", 50, split), ("out_of_sample", split, len(rows))):
        position = 0
        entry = 0.0
        equity = 1.0
        peak = 1.0
        max_dd = 0.0
        trade_returns = []
        for i in range(max(start, 50), end - 1):
            closes = [r["close"] for r in rows[:i+1]]
            fast, slow = _ema(closes, 20), _ema(closes, 50)
            desired = 1 if fast and slow and fast > slow else -1 if fast and slow and fast < slow else 0
            execution = rows[i+1]["open"] * (1 + slippage_rate * desired) if desired else rows[i+1]["open"]
            if position and desired != position:
                exit_px = execution * (1 - slippage_rate * position)
                ret = position * (exit_px / entry - 1) - 2 * fee_rate
                equity *= max(0.0, 1 + ret)
                trade_returns.append(ret)
                position = 0
            if desired and not position:
                entry = execution * (1 + slippage_rate * desired)
                equity *= max(0.0, 1 - fee_rate)
                position = desired
            peak = max(peak, equity)
            max_dd = max(max_dd, (peak-equity)/peak if peak else 0)
        if position:
            px = rows[end-1]["close"] * (1 - slippage_rate * position)
            ret = position * (px / entry - 1) - fee_rate
            equity *= max(0.0, 1 + ret)
            trade_returns.append(ret)
        wins = [x for x in trade_returns if x > 0]
        losses = [x for x in trade_returns if x < 0]
        gross_win, gross_loss = sum(wins), abs(sum(losses))
        result[label] = {"return_pct": round((equity-1)*100, 3), "max_drawdown_pct": round(max_dd*100, 3),
                         "trades": len(trade_returns), "win_rate_pct": round(len(wins)/len(trade_returns)*100, 2) if trade_returns else 0,
                         "profit_factor": round(gross_win/gross_loss, 3) if gross_loss else (None if not wins else "inf"),
                         "expectancy_pct": round(mean(trade_returns)*100, 4) if trade_returns else 0}
    return {"status": "ok", "candles": len(rows), "split_index": split,
            "assumptions": {"fee_per_side_pct": fee_rate*100, "slippage_per_side_pct": slippage_rate*100,
                            "execution": "next candle open", "strategy": "EMA20/EMA50 trend"}, **result,
            "warning": "Исторический тест не гарантирует будущий результат. Для вывода нужны разные рыночные режимы и больше данных."}
