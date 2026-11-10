"""Fair, cost-aware comparison of independent trading strategies on identical OHLCV data.

Research only: this module never creates signals or orders for Paper Trading.
Each strategy is tested on the same chronological in-sample/out-of-sample split.
"""
from __future__ import annotations

from math import isfinite
from statistics import mean
from typing import Any

FEE_RATE = 0.001
SLIPPAGE_RATE = 0.0005
TRAIN_FRACTION = 0.70

STRATEGIES = {
    "ema_trend": "EMA Trend 20/50",
    "ema_pullback": "EMA Pullback 20/50",
    "donchian_breakout": "Donchian Breakout 20",
    "rsi_reversion": "RSI Mean Reversion 14",
}


def _clean_rows(candles: list[dict[str, Any]]) -> list[dict[str, float]]:
    rows = []
    for candle in candles or []:
        try:
            row = {key: float(candle[key]) for key in ("open", "high", "low", "close", "volume")}
            if not all(isfinite(v) for v in row.values()):
                continue
            if min(row[k] for k in ("open", "high", "low", "close")) <= 0 or row["volume"] < 0:
                continue
            if row["high"] < max(row["open"], row["close"], row["low"]):
                continue
            if row["low"] > min(row["open"], row["close"], row["high"]):
                continue
            rows.append(row)
        except (KeyError, TypeError, ValueError):
            continue
    return rows


def _ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    value = mean(values[:period])
    alpha = 2.0 / (period + 1)
    for item in values[period:]:
        value += alpha * (item - value)
    return value


def _rsi(values: list[float], period: int = 14) -> float | None:
    if len(values) <= period:
        return None
    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    gains = [max(x, 0.0) for x in changes]
    losses = [max(-x, 0.0) for x in changes]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(changes)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


def _target_positions(rows: list[dict[str, float]], strategy: str, start: int, end: int) -> dict[int, int]:
    """Return desired position after each candle close; no future data is read."""
    targets: dict[int, int] = {}
    active = 0  # Reset independently for every segment; no position crosses the split.
    for i in range(start, end - 1):
        closes = [r["close"] for r in rows[:i + 1]]
        price = closes[-1]
        fast, slow = _ema(closes, 20), _ema(closes, 50)
        previous_price = closes[-2] if len(closes) > 1 else price
        previous_ema20 = _ema(closes[:-1], 20) if len(closes) > 1 else None

        if strategy == "ema_trend":
            active = 1 if fast is not None and slow is not None and fast > slow else -1 if fast is not None and slow is not None and fast < slow else 0
        elif strategy == "ema_pullback":
            if fast is not None and slow is not None:
                if active == 1 and (price < slow or fast <= slow):
                    active = 0
                elif active == -1 and (price > slow or fast >= slow):
                    active = 0
                elif active == 0 and previous_ema20 is not None:
                    if fast > slow and previous_price <= previous_ema20 and price > fast:
                        active = 1
                    elif fast < slow and previous_price >= previous_ema20 and price < fast:
                        active = -1
        elif strategy == "donchian_breakout":
            if i >= 20:
                prior = rows[i - 20:i]
                upper = max(r["high"] for r in prior)
                lower = min(r["low"] for r in prior)
                if price > upper:
                    active = 1
                elif price < lower:
                    active = -1
        elif strategy == "rsi_reversion":
            value = _rsi(closes, 14)
            if value is not None:
                if active == 1 and value >= 50:
                    active = 0
                elif active == -1 and value <= 50:
                    active = 0
                elif active == 0 and value <= 30:
                    active = 1
                elif active == 0 and value >= 70:
                    active = -1
        else:
            raise ValueError(f"Unknown strategy: {strategy}")
        targets[i] = active
    return targets


def _simulate(rows: list[dict[str, float]], strategy: str, start: int, end: int,
              fee_rate: float, slippage_rate: float) -> dict[str, Any]:
    targets = _target_positions(rows, strategy, start, end)
    capital = 1.0
    position = 0
    quantity = entry_fill = entry_equity = entry_fee = 0.0
    peak = 1.0
    max_drawdown = 0.0
    total_fees = 0.0
    trade_returns: list[float] = []
    wins: list[float] = []
    losses: list[float] = []
    curve: list[dict[str, float | int]] = []

    def mark(price: float) -> float:
        return capital + quantity * position * (price - entry_fill) if position else capital

    def close(raw_price: float) -> None:
        nonlocal capital, position, quantity, entry_fill, entry_equity, entry_fee, total_fees
        fill = raw_price * (1 - slippage_rate * position)
        exit_fee = quantity * fill * fee_rate
        gross = quantity * position * (fill - entry_fill)
        net = gross - entry_fee - exit_fee
        capital += gross - exit_fee  # Entry fee was already deducted at entry.
        total_fees += exit_fee
        pct = net / entry_equity * 100 if entry_equity > 0 else 0.0
        trade_returns.append(pct)
        if net > 0:
            wins.append(net)
        elif net < 0:
            losses.append(abs(net))
        position = 0
        quantity = entry_fill = entry_equity = entry_fee = 0.0

    for i in range(start, end - 1):
        desired = targets.get(i, 0)
        next_open = rows[i + 1]["open"]
        if position and desired != position:
            close(next_open)
        if desired and not position:
            fill = next_open * (1 + slippage_rate * desired)
            if capital > 0 and fill > 0:
                entry_equity = capital
                quantity = entry_equity / fill  # 100% notional, no leverage.
                entry_fill = fill
                entry_fee = quantity * fill * fee_rate
                capital -= entry_fee
                total_fees += entry_fee
                position = desired
        equity = mark(rows[i + 1]["close"])
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - equity) / peak)
        curve.append({"candle": i + 1, "equity": round(equity, 8)})

    if position:
        close(rows[end - 1]["close"])
        equity = capital
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - equity) / peak)
        curve.append({"candle": end - 1, "equity": round(equity, 8)})

    gross_win, gross_loss = sum(wins), sum(losses)
    pf: float | str | None = round(gross_win / gross_loss, 3) if gross_loss else ("inf" if gross_win else None)
    if len(curve) > 100:
        stride = (len(curve) - 1) / 99
        curve = [curve[round(j * stride)] for j in range(100)]
    return {
        "return_pct": round((capital - 1) * 100, 3),
        "max_drawdown_pct": round(max_drawdown * 100, 3),
        "trades": len(trade_returns),
        "win_rate_pct": round(100 * len(wins) / len(trade_returns), 2) if trade_returns else 0.0,
        "profit_factor": pf,
        "expectancy_pct": round(mean(trade_returns), 4) if trade_returns else 0.0,
        "fees_paid_pct_initial_equity": round(total_fees * 100, 4),
        "equity_curve": curve,
    }


def compare_strategies(candles: list[dict[str, Any]], *, fee_rate: float = FEE_RATE,
                       slippage_rate: float = SLIPPAGE_RATE,
                       train_fraction: float = TRAIN_FRACTION) -> dict[str, Any]:
    if not (0 <= fee_rate < 0.1) or not (0 <= slippage_rate < 0.1):
        raise ValueError("fee_rate and slippage_rate must be between 0 and 0.1")
    if not (0.55 <= train_fraction <= 0.85):
        raise ValueError("train_fraction must be between 0.55 and 0.85")
    rows = _clean_rows(candles)
    if len(rows) < 150:
        return {"status": "insufficient_data", "candles": len(rows), "minimum_candles": 150, "strategies": []}
    split = max(100, min(len(rows) - 30, int(len(rows) * train_fraction)))
    results = []
    for key, label in STRATEGIES.items():
        ins = _simulate(rows, key, 50, split, fee_rate, slippage_rate)
        oos = _simulate(rows, key, split, len(rows), fee_rate, slippage_rate)
        # Ranking is descriptive and based on holdout performance, never a live switch.
        results.append({"id": key, "name": label, "in_sample": ins, "out_of_sample": oos})
    results.sort(key=lambda x: (x["out_of_sample"]["return_pct"], -x["out_of_sample"]["max_drawdown_pct"]), reverse=True)
    for rank, item in enumerate(results, 1):
        item["out_of_sample_rank"] = rank
    return {
        "status": "ok", "candles": len(rows), "split_index": split,
        "comparison_basis": "All strategies use identical candles, split, starting equity, sizing and execution assumptions.",
        "assumptions": {
            "fee_per_side_pct": fee_rate * 100,
            "slippage_per_side_pct": slippage_rate * 100,
            "execution": "signal at candle close; fill at next candle open with one adverse slippage adjustment",
            "position_sizing": "100% of equity notional; no leverage; one position per strategy",
            "segments": "in-sample and out-of-sample start flat; no position crosses the split",
            "ranking": "descriptive ranking by out-of-sample return, then lower drawdown",
        },
        "strategies": results,
        "warning": "Research comparison, not a profitability guarantee. OHLCV simulation omits funding, spread, partial fills and intrabar execution. A strategy with few trades or a short holdout is not statistically validated.",
    }
