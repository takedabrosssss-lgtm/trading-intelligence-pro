"""Walk-forward strategy research. Research only: never emits or routes trading orders."""
from __future__ import annotations

from math import isfinite
from statistics import mean
from typing import Any

FEE_RATE = 0.001
SLIPPAGE_RATE = 0.0005


def _clean(candles: list[dict[str, Any]]) -> list[dict[str, float]]:
    rows = []
    for candle in candles or []:
        try:
            row = {k: float(candle[k]) for k in ("open", "high", "low", "close", "volume")}
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
    value = sum(values[:period]) / period
    alpha = 2.0 / (period + 1)
    for item in values[period:]:
        value += alpha * (item - value)
    return value


def _rsi(values: list[float], period: int) -> float | None:
    if len(values) <= period:
        return None
    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    gains = [max(x, 0.0) for x in changes]
    losses = [max(-x, 0.0) for x in changes]
    gain = sum(gains[:period]) / period
    loss = sum(losses[:period]) / period
    for i in range(period, len(changes)):
        gain = (gain * (period - 1) + gains[i]) / period
        loss = (loss * (period - 1) + losses[i]) / period
    if loss == 0:
        return 100.0 if gain else 50.0
    rs = gain / loss
    return 100.0 - 100.0 / (1.0 + rs)


CANDIDATES = {
    "ema_trend": [
        {"fast": 10, "slow": 40},
        {"fast": 20, "slow": 50},
        {"fast": 30, "slow": 80},
    ],
    "ema_pullback": [
        {"fast": 10, "slow": 40},
        {"fast": 20, "slow": 50},
        {"fast": 30, "slow": 80},
    ],
    "donchian": [{"lookback": 15}, {"lookback": 20}, {"lookback": 30}],
    "rsi_reversion": [
        {"period": 10, "lower": 25, "upper": 75},
        {"period": 14, "lower": 30, "upper": 70},
        {"period": 20, "lower": 35, "upper": 65},
    ],
}
LABELS = {
    "ema_trend": "EMA Trend",
    "ema_pullback": "EMA Pullback",
    "donchian": "Donchian Breakout",
    "rsi_reversion": "RSI Mean Reversion",
}


def _signal(rows: list[dict[str, float]], i: int, family: str, params: dict[str, int], active: int) -> int:
    closes = [r["close"] for r in rows[:i + 1]]
    price = closes[-1]
    if family in {"ema_trend", "ema_pullback"}:
        fast = _ema(closes, params["fast"])
        slow = _ema(closes, params["slow"])
        if fast is None or slow is None:
            return 0 if family == "ema_trend" else active
        if family == "ema_trend":
            return 1 if fast > slow else -1 if fast < slow else 0
        prev_fast = _ema(closes[:-1], params["fast"]) if len(closes) > 1 else None
        if active == 1 and (price < slow or fast <= slow):
            return 0
        if active == -1 and (price > slow or fast >= slow):
            return 0
        if active == 0 and prev_fast is not None:
            if fast > slow and closes[-2] <= prev_fast and price > fast:
                return 1
            if fast < slow and closes[-2] >= prev_fast and price < fast:
                return -1
        return active
    if family == "donchian":
        lookback = params["lookback"]
        if i < lookback:
            return active
        prior = rows[i - lookback:i]
        upper = max(r["high"] for r in prior)
        lower = min(r["low"] for r in prior)
        return 1 if price > upper else -1 if price < lower else active
    value = _rsi(closes, params["period"])
    if value is None:
        return active
    if active == 1 and value >= 50:
        return 0
    if active == -1 and value <= 50:
        return 0
    if active == 0 and value <= params["lower"]:
        return 1
    if active == 0 and value >= params["upper"]:
        return -1
    return active


def _simulate(rows: list[dict[str, float]], family: str, params: dict[str, int], start: int, end: int,
              fee_rate: float = FEE_RATE, slippage_rate: float = SLIPPAGE_RATE) -> dict[str, Any]:
    capital = 1.0
    position = 0
    qty = entry = entry_fee = entry_equity = 0.0
    peak = 1.0
    max_dd = 0.0
    fees = 0.0
    trade_pnls: list[float] = []
    wins: list[float] = []
    losses: list[float] = []
    active = 0

    def close(raw_price: float) -> None:
        nonlocal capital, position, qty, entry, entry_fee, entry_equity, fees
        fill = raw_price * (1 - slippage_rate * position)
        exit_fee = qty * fill * fee_rate
        gross = qty * position * (fill - entry)
        net = gross - entry_fee - exit_fee
        capital += gross - exit_fee
        fees += exit_fee
        trade_pnls.append(net / entry_equity * 100 if entry_equity else 0.0)
        if net > 0:
            wins.append(net)
        elif net < 0:
            losses.append(abs(net))
        position = 0
        qty = entry = entry_fee = entry_equity = 0.0

    for i in range(start, end - 1):
        desired = _signal(rows, i, family, params, active)
        active = desired
        next_open = rows[i + 1]["open"]
        if position and desired != position:
            close(next_open)
        if desired and not position:
            fill = next_open * (1 + slippage_rate * desired)
            if capital > 0 and fill > 0:
                entry_equity = capital
                qty = capital / fill
                entry = fill
                entry_fee = qty * fill * fee_rate
                capital -= entry_fee
                fees += entry_fee
                position = desired
        equity = capital + qty * position * (rows[i + 1]["close"] - entry) if position else capital
        peak = max(peak, equity)
        if peak > 0:
            max_dd = max(max_dd, (peak - equity) / peak)

    if position:
        close(rows[end - 1]["close"])
        peak = max(peak, capital)
        if peak > 0:
            max_dd = max(max_dd, (peak - capital) / peak)

    gross_win, gross_loss = sum(wins), sum(losses)
    return {
        "return_pct": (capital - 1.0) * 100,
        "max_drawdown_pct": max_dd * 100,
        "trades": len(trade_pnls),
        "wins": len(wins),
        "gross_wins": gross_win,
        "gross_losses": gross_loss,
        "fees_pct": fees * 100,
        "profit_factor": gross_win / gross_loss if gross_loss else (float("inf") if gross_win else None),
        "win_rate_pct": 100 * len(wins) / len(trade_pnls) if trade_pnls else 0.0,
        "expectancy_pct": mean(trade_pnls) if trade_pnls else 0.0,
    }


def _regime(rows: list[dict[str, float]]) -> dict[str, Any]:
    closes = [r["close"] for r in rows]
    ema20, ema50 = _ema(closes, 20), _ema(closes, 50)
    returns = [abs(closes[i] / closes[i - 1] - 1) * 100 for i in range(max(1, len(closes) - 30), len(closes))]
    volatility = mean(returns) if returns else 0.0
    gap = abs(ema20 / ema50 - 1) * 100 if ema20 and ema50 else 0.0
    label = "high_volatility" if volatility >= 1.5 else "trend" if gap >= 0.8 else "range"
    return {"label": label, "ema_gap_pct": round(gap, 3), "mean_abs_candle_return_pct": round(volatility, 3),
            "note": "Regime is descriptive and is not used to place or filter Paper Trading orders."}


def research_strategies(candles: list[dict[str, Any]], *, fee_rate: float = FEE_RATE,
                        slippage_rate: float = SLIPPAGE_RATE) -> dict[str, Any]:
    if not (0 <= fee_rate < 0.1 and 0 <= slippage_rate < 0.1):
        raise ValueError("Execution costs must be between 0 and 10% per side")
    rows = _clean(candles)
    if len(rows) < 240:
        return {"status": "insufficient_data", "candles": len(rows), "minimum_candles": 240, "families": []}

    # Three expanding-window folds: each later training window may use prior validation data,
    # but never the current or future validation window.
    first_train = max(150, int(len(rows) * 0.55))
    remaining = len(rows) - first_train
    fold_size = remaining // 3
    if fold_size < 20:
        return {"status": "insufficient_data", "candles": len(rows), "minimum_candles": 240, "families": []}

    all_results = []
    for family, candidates in CANDIDATES.items():
        folds = []
        aggregate_wins = aggregate_losses = 0.0
        total_trades = total_winning_trades = 0
        total_fees = 0.0
        compounded = 1.0
        drawdowns = []
        selected_params = []
        for fold in range(3):
            test_start = first_train + fold * fold_size
            test_end = len(rows) if fold == 2 else test_start + fold_size
            training_results = []
            for params in candidates:
                result = _simulate(rows, family, params, 50, test_start, fee_rate, slippage_rate)
                # A modest trade-count guard prevents choosing a one-trade lucky fit.
                score = result["return_pct"] - 0.5 * result["max_drawdown_pct"]
                if result["trades"] < 3:
                    score -= 5.0
                training_results.append((score, params, result))
            _, chosen, train_metrics = max(training_results, key=lambda item: item[0])
            test_metrics = _simulate(rows, family, chosen, test_start, test_end, fee_rate, slippage_rate)
            selected_params.append(chosen)
            compounded *= max(0.0, 1.0 + test_metrics["return_pct"] / 100.0)
            drawdowns.append(test_metrics["max_drawdown_pct"])
            total_trades += test_metrics["trades"]
            total_winning_trades += test_metrics["wins"]
            aggregate_wins += test_metrics["gross_wins"]
            aggregate_losses += test_metrics["gross_losses"]
            total_fees += test_metrics["fees_pct"]
            folds.append({
                "fold": fold + 1,
                "training_candles": test_start - 50,
                "validation_candles": test_end - test_start,
                "selected_parameters": chosen,
                "training_return_pct": round(train_metrics["return_pct"], 3),
                "validation_return_pct": round(test_metrics["return_pct"], 3),
                "validation_drawdown_pct": round(test_metrics["max_drawdown_pct"], 3),
                "validation_trades": test_metrics["trades"],
                "validation_win_rate_pct": round(test_metrics["win_rate_pct"], 2),
                "validation_profit_factor": round(test_metrics["profit_factor"], 3) if test_metrics["profit_factor"] is not None and isfinite(test_metrics["profit_factor"]) else ("inf" if test_metrics["profit_factor"] else None),
            })
        pf = aggregate_wins / aggregate_losses if aggregate_losses else (float("inf") if aggregate_wins else None)
        positive_folds = sum(1 for f in folds if f["validation_return_pct"] > 0)
        stable_params = len({tuple(sorted(p.items())) for p in selected_params}) == 1
        all_results.append({
            "id": family,
            "name": LABELS[family],
            "out_of_sample_return_pct": round((compounded - 1.0) * 100, 3),
            "max_fold_drawdown_pct": round(max(drawdowns, default=0.0), 3),
            "validation_trades": total_trades,
            "win_rate_pct": round(100 * total_winning_trades / total_trades, 2) if total_trades else 0.0,
            "profit_factor": round(pf, 3) if pf is not None and isfinite(pf) else ("inf" if pf else None),
            "fees_pct_initial_equity_approx": round(total_fees, 4),
            "positive_folds": positive_folds,
            "parameter_stability": "stable" if stable_params else "varied",
            "folds": folds,
            "research_status": "promising_but_unconfirmed" if positive_folds >= 2 and total_trades >= 30 and pf is not None and pf > 1 else "not_validated",
        })
    all_results.sort(key=lambda x: (x["out_of_sample_return_pct"], x["positive_folds"], -x["max_fold_drawdown_pct"]), reverse=True)
    for rank, item in enumerate(all_results, 1):
        item["rank"] = rank
    return {
        "status": "ok",
        "candles": len(rows),
        "folds": 3,
        "initial_training_fraction_pct": round(first_train / len(rows) * 100, 1),
        "regime": _regime(rows),
        "families": all_results,
        "assumptions": {
            "fee_per_side_pct": fee_rate * 100,
            "slippage_per_side_pct": slippage_rate * 100,
            "execution": "signal at close; next candle open fill; one adverse slippage adjustment per fill",
            "position_sizing": "100% notional, no leverage; independent flat-start validation folds",
            "optimization": "parameters selected only on each fold's preceding history",
        },
        "warning": "Research only, not a profitability guarantee. OHLCV does not model funding, spread, partial fills or intrabar execution. Short samples and low trade counts are not statistically validated. No result changes Paper Trading settings.",
    }
