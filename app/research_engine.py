"""Optimized walk-forward strategy research. Research only; never routes orders."""
from __future__ import annotations
from collections import deque
from math import isfinite
from statistics import mean
from typing import Any

FEE_RATE = 0.001
SLIPPAGE_RATE = 0.0005


def _clean(candles):
    rows = []
    for c in candles or []:
        try:
            r = {k: float(c[k]) for k in ("open", "high", "low", "close", "volume")}
            if not all(isfinite(v) for v in r.values()): continue
            if min(r[k] for k in ("open", "high", "low", "close")) <= 0 or r["volume"] < 0: continue
            if r["high"] < max(r["open"], r["close"], r["low"]) or r["low"] > min(r["open"], r["close"], r["high"]): continue
            rows.append(r)
        except (KeyError, TypeError, ValueError):
            continue
    return rows


def _ema_series(values, period):
    out = [None] * len(values)
    if len(values) < period: return out
    value = sum(values[:period]) / period
    out[period - 1] = value
    alpha = 2.0 / (period + 1)
    for i in range(period, len(values)):
        value += alpha * (values[i] - value)
        out[i] = value
    return out


def _rsi_series(values, period):
    out = [None] * len(values)
    if len(values) <= period: return out
    gains = [max(values[i] - values[i-1], 0.0) for i in range(1, len(values))]
    losses = [max(values[i-1] - values[i], 0.0) for i in range(1, len(values))]
    gain, loss = sum(gains[:period]) / period, sum(losses[:period]) / period
    def calc(g, l):
        if l == 0: return 100.0 if g else 50.0
        rs = g / l
        return 100.0 - 100.0 / (1.0 + rs)
    out[period] = calc(gain, loss)
    for i in range(period + 1, len(values)):
        j = i - 1
        gain = (gain * (period - 1) + gains[j]) / period
        loss = (loss * (period - 1) + losses[j]) / period
        out[i] = calc(gain, loss)
    return out


def _donchian_series(rows, lookback):
    upper, lower = [None] * len(rows), [None] * len(rows)
    hi, lo = deque(), deque()
    for i, row in enumerate(rows):
        # Values at i use only candles strictly before i.
        while hi and hi[0] <= i - lookback: hi.popleft()
        while lo and lo[0] <= i - lookback: lo.popleft()
        if i >= lookback:
            upper[i], lower[i] = rows[hi[0]]["high"], rows[lo[0]]["low"]
        while hi and rows[hi[-1]]["high"] <= row["high"]: hi.pop()
        while lo and rows[lo[-1]]["low"] >= row["low"]: lo.pop()
        hi.append(i); lo.append(i)
    return upper, lower


CANDIDATES = {
    "ema_trend": [{"fast": 10, "slow": 40}, {"fast": 20, "slow": 50}, {"fast": 30, "slow": 80}],
    "ema_pullback": [{"fast": 10, "slow": 40}, {"fast": 20, "slow": 50}, {"fast": 30, "slow": 80}],
    "donchian": [{"lookback": 15}, {"lookback": 20}, {"lookback": 30}],
    "rsi_reversion": [{"period": 10, "lower": 25, "upper": 75}, {"period": 14, "lower": 30, "upper": 70}, {"period": 20, "lower": 35, "upper": 65}],
}
LABELS = {"ema_trend": "EMA Trend", "ema_pullback": "EMA Pullback", "donchian": "Donchian Breakout", "rsi_reversion": "RSI Mean Reversion"}


def _prepare(rows, family, params):
    closes = [r["close"] for r in rows]
    if family in ("ema_trend", "ema_pullback"):
        return (_ema_series(closes, params["fast"]), _ema_series(closes, params["slow"]))
    if family == "donchian": return _donchian_series(rows, params["lookback"])
    return _rsi_series(closes, params["period"])


def _signal(rows, i, family, params, active, prepared):
    price = rows[i]["close"]
    if family in ("ema_trend", "ema_pullback"):
        fast, slow = prepared[0][i], prepared[1][i]
        if fast is None or slow is None: return 0 if family == "ema_trend" else active
        if family == "ema_trend": return 1 if fast > slow else -1 if fast < slow else 0
        prev_fast = prepared[0][i-1] if i else None
        if active == 1 and (price < slow or fast <= slow): return 0
        if active == -1 and (price > slow or fast >= slow): return 0
        if active == 0 and prev_fast is not None:
            if fast > slow and rows[i-1]["close"] <= prev_fast and price > fast: return 1
            if fast < slow and rows[i-1]["close"] >= prev_fast and price < fast: return -1
        return active
    if family == "donchian":
        upper, lower = prepared[0][i], prepared[1][i]
        if upper is None: return active
        return 1 if price > upper else -1 if price < lower else active
    value = prepared[i]
    if value is None: return active
    if active == 1 and value >= 50: return 0
    if active == -1 and value <= 50: return 0
    if active == 0 and value <= params["lower"]: return 1
    if active == 0 and value >= params["upper"]: return -1
    return active


def _simulate(rows, family, params, start, end, fee_rate=FEE_RATE, slippage_rate=SLIPPAGE_RATE, prepared=None):
    if prepared is None: prepared = _prepare(rows, family, params)
    capital, position, qty, entry, entry_fee, entry_equity = 1.0, 0, 0.0, 0.0, 0.0, 0.0
    peak, max_dd, fees, active = 1.0, 0.0, 0.0, 0
    trade_pnls, wins, losses = [], [], []
    def close(raw_price):
        nonlocal capital, position, qty, entry, entry_fee, entry_equity, fees
        fill = raw_price * (1 - slippage_rate * position)
        exit_fee = qty * fill * fee_rate
        gross = qty * position * (fill - entry)
        net = gross - entry_fee - exit_fee
        capital += gross - exit_fee; fees += exit_fee
        trade_pnls.append(net / entry_equity * 100 if entry_equity else 0.0)
        if net > 0: wins.append(net)
        elif net < 0: losses.append(abs(net))
        position = 0; qty = entry = entry_fee = entry_equity = 0.0
    for i in range(start, end - 1):
        desired = _signal(rows, i, family, params, active, prepared); active = desired
        next_open = rows[i+1]["open"]
        if position and desired != position: close(next_open)
        if desired and not position:
            fill = next_open * (1 + slippage_rate * desired)
            if capital > 0 and fill > 0:
                entry_equity = capital; qty = capital / fill; entry = fill
                entry_fee = qty * fill * fee_rate; capital -= entry_fee; fees += entry_fee; position = desired
        equity = capital + qty * position * (rows[i+1]["close"] - entry) if position else capital
        peak = max(peak, equity)
        if peak > 0: max_dd = max(max_dd, (peak-equity)/peak)
    if position:
        close(rows[end-1]["close"]); peak = max(peak, capital)
        if peak > 0: max_dd = max(max_dd, (peak-capital)/peak)
    gross_win, gross_loss = sum(wins), sum(losses)
    return {"return_pct": (capital-1)*100, "max_drawdown_pct": max_dd*100, "trades": len(trade_pnls),
            "wins": len(wins), "gross_wins": gross_win, "gross_losses": gross_loss, "fees_pct": fees*100,
            "profit_factor": gross_win/gross_loss if gross_loss else (float("inf") if gross_win else None),
            "win_rate_pct": 100*len(wins)/len(trade_pnls) if trade_pnls else 0.0,
            "expectancy_pct": mean(trade_pnls) if trade_pnls else 0.0}


def _ema(values, period):
    s = _ema_series(values, period)
    return s[-1] if s else None


def _regime(rows):
    closes = [r["close"] for r in rows]
    e20, e50 = _ema(closes, 20), _ema(closes, 50)
    returns = [abs(closes[i]/closes[i-1]-1)*100 for i in range(max(1, len(closes)-30), len(closes))]
    volatility = mean(returns) if returns else 0.0
    gap = abs(e20/e50-1)*100 if e20 and e50 else 0.0
    label = "high_volatility" if volatility >= 1.5 else "trend" if gap >= 0.8 else "range"
    return {"label": label, "ema_gap_pct": round(gap, 3), "mean_abs_candle_return_pct": round(volatility, 3), "note": "Regime is descriptive and is not used to place or filter Paper Trading orders."}


def research_strategies(candles, *, fee_rate=FEE_RATE, slippage_rate=SLIPPAGE_RATE):
    if not (0 <= fee_rate < 0.1 and 0 <= slippage_rate < 0.1): raise ValueError("Execution costs must be between 0 and 10% per side")
    rows = _clean(candles)
    if len(rows) < 240: return {"status": "insufficient_data", "candles": len(rows), "minimum_candles": 240, "families": []}
    first_train = max(150, int(len(rows)*0.55)); fold_size = (len(rows)-first_train)//3
    if fold_size < 20: return {"status": "insufficient_data", "candles": len(rows), "minimum_candles": 240, "families": []}
    all_results = []
    for family, candidates in CANDIDATES.items():
        folds=[]; aggregate_wins=aggregate_losses=0.0; total_trades=total_winning_trades=0; total_fees=0.0
        compounded=1.0; drawdowns=[]; selected_params=[]
        # Precompute each candidate's indicators once; simulations become linear passes.
        prepared_candidates = [(p, _prepare(rows, family, p)) for p in candidates]
        for fold in range(3):
            test_start=first_train+fold*fold_size; test_end=len(rows) if fold==2 else test_start+fold_size
            training=[]
            for params, prepared in prepared_candidates:
                metrics=_simulate(rows, family, params, 50, test_start, fee_rate, slippage_rate, prepared)
                score=metrics["return_pct"]-0.5*metrics["max_drawdown_pct"]
                if metrics["trades"] < 3: score -= 5.0
                training.append((score, params, metrics))
            _, chosen, train_metrics=max(training, key=lambda x:x[0])
            prepared=dict((id(p), ind) for p, ind in prepared_candidates)[id(chosen)]
            test_metrics=_simulate(rows, family, chosen, test_start, test_end, fee_rate, slippage_rate, prepared)
            selected_params.append(chosen); compounded *= max(0.0, 1+test_metrics["return_pct"]/100)
            drawdowns.append(test_metrics["max_drawdown_pct"]); total_trades += test_metrics["trades"]
            total_winning_trades += test_metrics["wins"]; aggregate_wins += test_metrics["gross_wins"]
            aggregate_losses += test_metrics["gross_losses"]; total_fees += test_metrics["fees_pct"]
            pf=test_metrics["profit_factor"]
            folds.append({"fold":fold+1,"training_candles":test_start-50,"validation_candles":test_end-test_start,
                "selected_parameters":chosen,"training_return_pct":round(train_metrics["return_pct"],3),
                "validation_return_pct":round(test_metrics["return_pct"],3),"validation_drawdown_pct":round(test_metrics["max_drawdown_pct"],3),
                "validation_trades":test_metrics["trades"],"validation_win_rate_pct":round(test_metrics["win_rate_pct"],2),
                "validation_profit_factor":round(pf,3) if pf is not None and isfinite(pf) else ("inf" if pf else None)})
        pf=aggregate_wins/aggregate_losses if aggregate_losses else (float("inf") if aggregate_wins else None)
        positive=sum(1 for f in folds if f["validation_return_pct"]>0); stable=len({tuple(sorted(p.items())) for p in selected_params})==1
        all_results.append({"id":family,"name":LABELS[family],"out_of_sample_return_pct":round((compounded-1)*100,3),
            "max_fold_drawdown_pct":round(max(drawdowns,default=0),3),"validation_trades":total_trades,
            "win_rate_pct":round(100*total_winning_trades/total_trades,2) if total_trades else 0.0,
            "profit_factor":round(pf,3) if pf is not None and isfinite(pf) else ("inf" if pf else None),
            "fees_pct_initial_equity_approx":round(total_fees,4),"positive_folds":positive,"parameter_stability":"stable" if stable else "varied",
            "folds":folds,"research_status":"promising_but_unconfirmed" if positive>=2 and total_trades>=30 and pf is not None and pf>1 else "not_validated"})
    all_results.sort(key=lambda x:(x["out_of_sample_return_pct"],x["positive_folds"],-x["max_fold_drawdown_pct"]),reverse=True)
    for rank,item in enumerate(all_results,1): item["rank"]=rank
    return {"status":"ok","candles":len(rows),"folds":3,"initial_training_fraction_pct":round(first_train/len(rows)*100,1),
        "regime":_regime(rows),"families":all_results,"assumptions":{"fee_per_side_pct":fee_rate*100,"slippage_per_side_pct":slippage_rate*100,
        "execution":"signal at close; next candle open fill; one adverse slippage adjustment per fill","position_sizing":"100% notional, no leverage; independent flat-start validation folds",
        "optimization":"parameters selected only on each fold's preceding history"},
        "warning":"Research only, not a profitability guarantee. OHLCV does not model funding, spread, partial fills or intrabar execution. Short samples and low trade counts are not statistically validated. No result changes Paper Trading settings."}
