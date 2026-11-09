from datetime import datetime, timezone
from typing import Any

from app.analyzer import analyze_strategy


MIN_SIGNAL_STRENGTH = 80
ALLOWED_GRADES = {"S", "A"}

STRATEGY_BY_TIMEFRAME = {
    "15m": "breakout",
    "1h": "ema_pullback",
    "4h": "trend_following",
}

TIMEFRAME_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
}

ATR_STOP_MULTIPLIER = 1.8
REWARD_RISK_RATIO = 2.0


def closed_candles(
    candles: list[dict[str, Any]],
    timeframe: str,
) -> list[dict[str, Any]]:
    duration = TIMEFRAME_MS.get(timeframe)

    if not duration or not candles:
        return candles

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    result = []

    for candle in candles:
        timestamp = candle.get("timestamp")

        if timestamp is None:
            result.append(candle)
            continue

        timestamp = int(timestamp)

        # Binance and Kraken timestamps are milliseconds in our market adapter.
        if timestamp + duration <= now_ms:
            result.append(candle)

    return result


def signal_strength(direction: str, raw_score: float) -> float:
    score = float(raw_score)
    return score if direction == "BUY" else 100.0 - score


def is_quality_signal_values(
    direction: str | None,
    score: float | int | None,
    grade: str | None,
) -> bool:
    if direction not in {"BUY", "SELL"} or score is None:
        return False

    if (grade or "").upper() not in ALLOWED_GRADES:
        return False

    try:
        strength = signal_strength(direction, float(score))
    except (TypeError, ValueError):
        return False

    return strength >= MIN_SIGNAL_STRENGTH


def generate_signal(
    candles: list[dict[str, Any]],
    symbol: str,
    timeframe: str,
    strategy: str,
) -> dict[str, Any] | None:
    candles = closed_candles(candles, timeframe)

    if len(candles) < 100:
        return None

    strategy_model = STRATEGY_BY_TIMEFRAME.get(timeframe)

    if not strategy_model:
        return None

    analysis = analyze_strategy(candles, strategy_model)

    if not analysis:
        return None

    direction = analysis["direction"]
    score = float(analysis["score"])
    grade = analysis["grade"]
    entry = float(analysis["entry_price"])

    indicators = analysis.get("indicators") or {}
    atr = indicators.get("atr")

    if direction not in {"BUY", "SELL"}:
        return None

    if atr is None or float(atr) <= 0 or entry <= 0:
        return None

    risk_distance = float(atr) * ATR_STOP_MULTIPLIER

    if direction == "BUY":
        stop_loss = entry - risk_distance
        take_profit = entry + risk_distance * REWARD_RISK_RATIO
    else:
        stop_loss = entry + risk_distance
        take_profit = entry - risk_distance * REWARD_RISK_RATIO

    if stop_loss <= 0 or take_profit <= 0:
        return None

    if direction == "BUY" and not stop_loss < entry < take_profit:
        return None

    if direction == "SELL" and not take_profit < entry < stop_loss:
        return None

    eligible = is_quality_signal_values(direction, score, grade)

    return {
        "symbol": symbol,
        "market": "crypto",
        "timeframe": timeframe,
        "direction": direction,
        "grade": grade,
        "score": score,
        "confidence": signal_strength(direction, score),
        "entry_price": entry,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        # Keep existing account names so old Paper Trading accounts continue working.
        "strategy": strategy,
        "strategy_model": strategy_model,
        "reasoning": analysis.get("reasoning", []),
        "indicators": indicators,
        "status": "new" if eligible else "filtered",
        "eligible": eligible,
    }


def is_eligible_for_auto_paper_trade(
    signal: dict[str, Any],
) -> bool:
    if not signal or signal.get("status") != "new":
        return False

    if not is_quality_signal_values(
        signal.get("direction"),
        signal.get("score"),
        signal.get("grade"),
    ):
        return False

    entry = signal.get("entry_price")
    stop = signal.get("stop_loss")
    target = signal.get("take_profit")

    if not all(
        isinstance(value, (int, float)) and value > 0
        for value in (entry, stop, target)
    ):
        return False

    if signal["direction"] == "BUY":
        return stop < entry < target

    return target < entry < stop


def is_duplicate_signal(
    existing_signals: list[Any],
    new_signal: dict[str, Any],
) -> bool:
    for existing in existing_signals:
        if (
            existing.symbol == new_signal["symbol"]
            and existing.timeframe == new_signal["timeframe"]
            and existing.direction == new_signal["direction"]
            and existing.grade == new_signal["grade"]
            and existing.status in {"new", "eligible"}
        ):
            return True

    return False
