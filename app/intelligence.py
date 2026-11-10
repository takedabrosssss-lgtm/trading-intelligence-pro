"""Explainable market intelligence and conservative, cost-aware OHLCV backtesting."""
from __future__ import annotations

from math import isfinite
from statistics import mean, pstdev
from typing import Any


def _valid_candles(candles: list[dict[str, Any]]) -> list[dict[str, float]]:
    clean: list[dict[str, float]] = []
    for candle in candles or []:
        try:
            row = {key: float(candle[key]) for key in ("open", "high", "low", "close", "volume")}
            if not all(isfinite(value) for value in row.values()):
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
    closes = [row["close"] for row in rows]
    volumes = [row["volume"] for row in rows]
    ema20, ema50 = _ema(closes, 20), _ema(closes, 50)
    returns = [closes[i] / closes[i - 1] - 1 for i in range(1, len(closes)) if closes[i - 1] > 0]
    volatility = pstdev(returns[-20:]) if len(returns) >= 20 else 0.0
    average_volume = mean(volumes[-21:-1]) if len(volumes) >= 21 else 0.0
    volume_ratio = volumes[-1] / average_volume if average_volume > 0 else 0.0
    recent_high = max(row["high"] for row in rows[-20:-1])
    recent_low = min(row["low"] for row in rows[-20:-1])
    last = closes[-1]
    trend_up = bool(ema20 and ema50 and ema20 > ema50 and last > ema20)
    trend_down = bool(ema20 and ema50 and ema20 < ema50 and last < ema20)
    breakout_up, breakout_down = last > recent_high, last < recent_low
    score, reasons = 50, []
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
    regime = "trend" if abs((ema20 or last) - (ema50 or last)) / last > 0.002 else "range"
    if volatility > 0.035:
        regime = "high_volatility"
    direction = "BUY" if score >= 65 else "SELL" if score <= 35 else "NEUTRAL"
    return {"status": "ok", "candles": len(rows), "price": last, "ema20": ema20, "ema50": ema50,
            "volatility_20": volatility, "volume_ratio": volume_ratio, "regime": regime,
            "direction": direction, "score": score, "signals": reasons,
            "note": "Индикаторная оценка, не вероятность прибыли и не торговая рекомендация."}


def _simulate_segment(rows: list[dict[str, float]], *, start: int, end: int,
                      fee_rate: float, slippage_rate: float) -> dict[str, Any]:
    """Run one chronological segment; signal at close i fills once at open i+1.

    One unit of equity is the initial capital. At entry, notional equals current
    equity (no leverage); entry fee is deducted immediately. Unrealized PnL is
    marked to each candle close. Each actual fill receives one adverse slippage
    adjustment and one fee. The segment starts flat and is liquidated at its end.
    """
    capital = 1.0
    position = 0  # +1 long, -1 short, 0 flat
    quantity = entry_fill = entry_equity = entry_fee = 0.0
    peak = 1.0
    max_drawdown = 0.0
    trade_returns: list[float] = []
    wins: list[float] = []
    losses: list[float] = []
    win_trade_returns: list[float] = []
    loss_trade_returns: list[float] = []
    total_fees = 0.0
    curve: list[dict[str, float | int]] = []

    def mark_equity(mark_price: float) -> float:
        if not position:
            return capital
        return capital + quantity * position * (mark_price - entry_fill)

    def close_position(raw_price: float) -> None:
        nonlocal capital, position, quantity, entry_fill, entry_equity, entry_fee, total_fees
        exit_fill = raw_price * (1 - slippage_rate * position)
        exit_fee = quantity * exit_fill * fee_rate
        gross = quantity * position * (exit_fill - entry_fill)
        net = gross - entry_fee - exit_fee
        capital += gross - exit_fee
        total_fees += exit_fee
        trade_returns.append(net / entry_equity * 100 if entry_equity > 0 else 0.0)
        trade_return_pct = net / entry_equity * 100 if entry_equity > 0 else 0.0
        if net > 0:
            wins.append(net)
            win_trade_returns.append(trade_return_pct)
        elif net < 0:
            losses.append(abs(net))
            loss_trade_returns.append(abs(trade_return_pct))
        position = 0
        quantity = entry_fill = entry_equity = entry_fee = 0.0

    # Each segment is flat at its first candle. Earlier candles may be used only
    # to warm up the indicators; no position is carried across the split.
    first_signal_index = max(50, start)
    for index in range(first_signal_index, end - 1):
        history = [row["close"] for row in rows[:index + 1]]
        fast, slow = _ema(history, 20), _ema(history, 50)
        desired = 1 if fast is not None and slow is not None and fast > slow else -1 if fast is not None and slow is not None and fast < slow else 0
        next_open = rows[index + 1]["open"]

        if position and desired != position:
            close_position(next_open)

        if desired and not position:
            fill = next_open * (1 + slippage_rate * desired)
            equity_before_entry = capital
            if equity_before_entry > 0 and fill > 0:
                quantity = equity_before_entry / fill
                entry_fill = fill
                entry_equity = equity_before_entry
                entry_fee = quantity * fill * fee_rate
                capital -= entry_fee
                total_fees += entry_fee
                position = desired

        equity_now = mark_equity(rows[index + 1]["close"])
        peak = max(peak, equity_now)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - equity_now) / peak)
        curve.append({"candle": index + 1, "equity": round(equity_now, 8)})

    if position:
        close_position(rows[end - 1]["close"])
        equity_now = capital
        peak = max(peak, equity_now)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - equity_now) / peak)
        curve.append({"candle": end - 1, "equity": round(equity_now, 8)})

    gross_win, gross_loss = sum(wins), sum(losses)
    profit_factor: float | str | None = round(gross_win / gross_loss, 3) if gross_loss else ("inf" if gross_win else None)
    # Keep the returned curve compact while preserving its start, end and shape.
    if len(curve) > 120:
        stride = (len(curve) - 1) / 119
        curve = [curve[round(i * stride)] for i in range(120)]

    return {
        "return_pct": round((capital - 1.0) * 100, 3),
        "max_drawdown_pct": round(max_drawdown * 100, 3),
        "trades": len(trade_returns),
        "win_rate_pct": round(100 * len(wins) / len(trade_returns), 2) if trade_returns else 0.0,
        "profit_factor": profit_factor,
        "expectancy_pct": round(mean(trade_returns), 4) if trade_returns else 0.0,
        "average_win_pct": round(mean(win_trade_returns), 4) if win_trade_returns else 0.0,
        "average_loss_pct": round(mean(loss_trade_returns), 4) if loss_trade_returns else 0.0,
        "fees_paid_pct_initial_equity": round(total_fees * 100, 4),
        "equity_curve": curve,
    }


def backtest(candles: list[dict[str, Any]], *, fee_rate: float = 0.001,
             slippage_rate: float = 0.0005, train_fraction: float = 0.70) -> dict[str, Any]:
    """EMA20/EMA50 long-short test with next-open fills and chronological holdout.

    Fees and adverse slippage are applied exactly once on every entry and exit.
    Equity is marked to market after every candle close for drawdown measurement.
    No leverage, pyramiding, or look-ahead execution is used.
    """
    if not (0 <= fee_rate < 0.1) or not (0 <= slippage_rate < 0.1):
        raise ValueError("fee_rate and slippage_rate must be between 0 and 0.1")
    if not (0.55 <= train_fraction <= 0.85):
        raise ValueError("train_fraction must be between 0.55 and 0.85")
    rows = _valid_candles(candles)
    if len(rows) < 100:
        return {"status": "insufficient_data", "candles": len(rows), "trades": 0}
    split = max(70, min(len(rows) - 20, int(len(rows) * train_fraction)))
    in_sample = _simulate_segment(rows, start=50, end=split, fee_rate=fee_rate, slippage_rate=slippage_rate)
    out_sample = _simulate_segment(rows, start=split, end=len(rows), fee_rate=fee_rate, slippage_rate=slippage_rate)
    return {
        "status": "ok", "candles": len(rows), "split_index": split,
        "assumptions": {
            "fee_per_side_pct": fee_rate * 100,
            "slippage_per_side_pct": slippage_rate * 100,
            "execution": "next candle open; one adverse slippage adjustment per fill",
            "equity_marking": "every candle close; out-of-sample starts flat",
            "position_sizing": "100% of current equity notional; no leverage",
            "strategy": "EMA20/EMA50 trend; long and short",
        },
        "in_sample": in_sample,
        "out_of_sample": out_sample,
        "warning": "Backtest is a simplified OHLCV simulation. It does not model funding, spread, partial fills, liquidation, or intrabar stop execution. Historical performance does not guarantee future results.",
    }
