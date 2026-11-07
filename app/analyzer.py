from statistics import mean
from app.config import get_settings

def ema(values, period):
    if len(values) < period: return []
    k = 2 / (period + 1)
    out = [mean(values[:period])]
    for v in values[period:]:
        out.append(v*k + out[-1]*(1-k))
    return [None]*(period-1) + out

def atr(candles, period=14):
    trs = []
    for i, c in enumerate(candles):
        if i == 0: trs.append(c["high"]-c["low"])
        else:
            p = candles[i-1]["close"]
            trs.append(max(c["high"]-c["low"], abs(c["high"]-p), abs(c["low"]-p)))
    return mean(trs[-period:]) if len(trs) >= period else None

def build_setup(candles, symbol, timeframe="1h"):
    """Deterministic baseline strategy: EMA trend + breakout/momentum + ATR risk.
    It is a transparent starter model, not an institutional SMC/AI prediction engine.
    """
    if len(candles) < 80: return None
    closes = [x["close"] for x in candles]
    e20, e50 = ema(closes,20), ema(closes,50)
    last, prev = candles[-1], candles[-2]
    vol = atr(candles)
    if not vol or vol <= 0: return None
    recent_high = max(x["high"] for x in candles[-21:-1])
    recent_low = min(x["low"] for x in candles[-21:-1])
    long = closes[-1] > e20[-1] > e50[-1] and closes[-1] > recent_high
    short = closes[-1] < e20[-1] < e50[-1] and closes[-1] < recent_low
    if not (long or short): return None
    direction = "LONG" if long else "SHORT"
    entry = last["close"]
    if long:
        sl = min(min(x["low"] for x in candles[-8:]), entry - 1.5*vol)
        risk = entry - sl
        if risk <= 0: return None
        tp1, tp2 = entry + risk, entry + 2*risk
    else:
        sl = max(max(x["high"] for x in candles[-8:]), entry + 1.5*vol)
        risk = sl - entry
        if risk <= 0: return None
        tp1, tp2 = entry - risk, entry - 2*risk
    score = min(100, 50 + 25*abs(closes[-1]-e20[-1])/vol + 10*abs(e20[-1]-e50[-1])/vol)
    return {"symbol":symbol, "direction":direction, "timeframe":timeframe, "entry":entry,
            "sl":sl, "tp1":tp1, "tp2":tp2, "score":round(score,1),
            "notes":"EMA20/EMA50 trend alignment + 20-bar breakout; ATR/structure-based risk."}

def backtest(candles, symbol, timeframe="1h", min_trades=30):
    wins = losses = 0
    outcomes = []
    start = max(80, len(candles)//3)
    for i in range(start, len(candles)-1):
        setup = build_setup(candles[:i+1], symbol, timeframe)
        if not setup: continue
        side, sl, tp = setup["direction"], setup["sl"], setup["tp1"]
        outcome = None
        for bar in candles[i+1:min(i+1+48, len(candles))]:
            if side == "LONG":
                hit_sl, hit_tp = bar["low"] <= sl, bar["high"] >= tp
            else:
                hit_sl, hit_tp = bar["high"] >= sl, bar["low"] <= tp
            if hit_sl: outcome = "LOSS"; break
            if hit_tp: outcome = "WIN"; break
        if outcome:
            outcomes.append(outcome)
            wins += outcome == "WIN"
            losses += outcome == "LOSS"
    n = wins + losses
    return {"winrate": round(100*wins/n,2) if n else 0.0, "trades":n, "wins":wins, "losses":losses,
            "sufficient": n >= min_trades}

def analyze(candles, symbol, timeframe="1h"):
    setup = build_setup(candles, symbol, timeframe)
    if not setup: return {"symbol":symbol, "signal":None, "reason":"No qualifying setup."}
    bt = backtest(candles, symbol, timeframe, get_settings().min_backtest_trades)
    setup.update({"historical_winrate":bt["winrate"], "sample_size":bt["trades"], "backtest":bt})
    threshold = get_settings().signal_min_winrate
    if not bt["sufficient"]:
        return {"symbol":symbol, "signal":None, "reason":f"Insufficient backtest sample ({bt['trades']} trades).", "setup":setup}
    if bt["winrate"] < threshold:
        return {"symbol":symbol, "signal":None, "reason":f"Historical winrate {bt['winrate']}% below threshold {threshold}%.", "setup":setup}
    return {"symbol":symbol, "signal":setup, "reason":"Passed historical filter."}
