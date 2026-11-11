from datetime import datetime, timezone
from typing import Any
from app.analyzer import analyze_strategy

MIN_SIGNAL_STRENGTH = 80
ALLOWED_GRADES = {"S", "A"}
STRATEGY_BY_TIMEFRAME = {"15m": "breakout", "1h": "ema_pullback", "4h": "trend_following", "1d": "trend_following"}
TIMEFRAME_MS = {"1m":60000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"4h":14400000,"1d":86400000,"1w":604800000}
ATR_STOP_MULTIPLIER = 1.8
REWARD_RISK_RATIO = 2.0


def closed_candles(candles: list[dict[str, Any]], timeframe: str) -> list[dict[str, Any]]:
    duration = TIMEFRAME_MS.get(timeframe)
    if not duration or not candles:
        return candles
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    result = []
    for candle in candles:
        timestamp = candle.get("timestamp")
        if timestamp is None or int(timestamp) + duration <= now_ms:
            result.append(candle)
    return result


def signal_strength(direction: str, raw_score: float) -> float:
    score = float(raw_score)
    return score if direction == "BUY" else 100.0-score


def is_quality_signal_values(direction, score, grade) -> bool:
    if direction not in {"BUY", "SELL"} or score is None or (grade or "").upper() not in ALLOWED_GRADES:
        return False
    try:
        strength = signal_strength(direction, float(score))
    except (TypeError, ValueError):
        return False
    return strength >= MIN_SIGNAL_STRENGTH


def quality_gate(direction: str, indicators: dict[str, Any], strategy_model: str) -> dict[str, Any]:
    """Require independent directional confirmation before publishing a setup."""
    adx_data = indicators.get("adx") or {}
    plus_di, minus_di = adx_data.get("plus_di"), adx_data.get("minus_di")
    ema20, ema20_previous = indicators.get("ema20"), indicators.get("ema20_previous")
    volume_ratio = indicators.get("volume_ratio")
    checks = {"directional_movement": False, "ema_slope": False, "volume_participation": False}
    reasons = []

    if plus_di is not None and minus_di is not None:
        checks["directional_movement"] = float(plus_di) > float(minus_di) if direction == "BUY" else float(minus_di) > float(plus_di)
    if not checks["directional_movement"]:
        reasons.append("DI не подтверждает направление")

    if ema20 is not None and ema20_previous is not None:
        checks["ema_slope"] = float(ema20) > float(ema20_previous) if direction == "BUY" else float(ema20) < float(ema20_previous)
    if not checks["ema_slope"]:
        reasons.append("Наклон EMA20 не подтверждает направление")

    minimum_volume = 1.2 if strategy_model == "breakout" else 0.75
    checks["volume_participation"] = volume_ratio is not None and float(volume_ratio) >= minimum_volume
    if not checks["volume_participation"]:
        reasons.append("Недостаточное участие объёма")

    return {"passed": all(checks.values()), "checks": checks, "minimum_volume_ratio": minimum_volume, "rejection_reasons": reasons}


def generate_signal(candles, symbol, timeframe, strategy):
    candles = closed_candles(candles, timeframe)
    if len(candles) < 100:
        def generate_signal(candles, symbol, timeframe, strategy, diagnostics=None):
    def reject(reason):
        if diagnostics is not None:
            diagnostics["reason"] = reason
        return None

    candles = closed_candles(candles, timeframe)

    if len(candles) < 100:
        return reject("insufficient_candles")

    model = STRATEGY_BY_TIMEFRAME.get(timeframe)
    if not model:
        return reject("unsupported_timeframe")

    analysis = analyze_strategy(candles, model)

    if not analysis:
        return reject("strategy_no_setup")

    direction = analysis["direction"]
    score = float(analysis["score"])
    grade = analysis["grade"]
    entry = float(analysis["entry_price"])

    indicators = analysis.get("indicators") or {}
    atr = indicators.get("atr")

    if (
        direction not in {"BUY", "SELL"}
        or atr is None
        or float(atr) <= 0
        or entry <= 0
    ):
        return reject("invalid_analysis")

    distance = float(atr) * ATR_STOP_MULTIPLIER

    if direction == "BUY":
        stop = entry - distance
        target = entry + distance * REWARD_RISK_RATIO
    else:
        stop = entry + distance
        target = entry - distance * REWARD_RISK_RATIO

    if stop <= 0 or target <= 0:
        return reject("invalid_risk_levels")

    base_quality = is_quality_signal_values(
        direction,
        score,
        grade,
    )

    gate = quality_gate(
        direction,
        indicators,
        model,
    )

    eligible = base_quality and gate["passed"]

    indicators = {
        **indicators,
        "quality_gate": gate,
    }

    result = {
        "symbol": symbol,
        "market": "crypto",
        "timeframe": timeframe,
        "direction": direction,
        "grade": grade,
        "score": score,
        "confidence": signal_strength(direction, score),
        "entry_price": entry,
        "stop_loss": stop,
        "take_profit": target,
        "strategy": strategy,
        "strategy_model": model,
        "reasoning": analysis.get("reasoning", []),
        "indicators": indicators,
        "quality_gate": gate,
        "base_quality": base_quality,
        "status": "new" if eligible else "filtered",
        "eligible": eligible,
    }

    if diagnostics is not None:
        diagnostics["reason"] = "candidate"

    return result
    if not signal or signal.get("status") != "new" or not is_quality_signal_values(signal.get("direction"), signal.get("score"), signal.get("grade")):
        return False
    entry, stop, target = signal.get("entry_price"), signal.get("stop_loss"), signal.get("take_profit")
    if not all(isinstance(v, (int, float)) and v > 0 for v in (entry, stop, target)):
        return False
    return stop < entry < target if signal["direction"] == "BUY" else target < entry < stop


def is_duplicate_signal(existing_signals, new_signal):
    active_statuses = {"new", "eligible", "sent", "paper_opened", "paper_closed", "paper_skipped"}
    return any(
        x.symbol == new_signal["symbol"] and x.timeframe == new_signal["timeframe"]
        and x.direction == new_signal["direction"] and x.grade == new_signal["grade"]
        and x.status in active_statuses
        for x in existing_signals
    )
