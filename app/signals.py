
from typing import Any

from app.analyzer import analyze_market


def generate_signal(
    candles: list[dict[str, Any]],
    symbol: str,
    timeframe: str,
    strategy: str,
) -> dict[str, Any] | None:
    analysis = analyze_market(candles)

    direction = analysis["direction"]
    score = analysis["score"]
    grade = analysis["grade"]
    entry = analysis["entry_price"]

    indicators = analysis.get("indicators", {})
    atr = indicators.get("atr")

    if direction not in {"BUY", "SELL"}:
        return None

    if atr is None or atr <= 0 or entry <= 0:
        return None

    eligible = (
        direction == "BUY"
        and score >= 70
        and grade in {"S", "A"}
    ) or (
        direction == "SELL"
        and score <= 30
        and grade in {"S", "A"}
    )

    risk_distance = atr * 1.5

    if direction == "BUY":
        stop_loss = entry - risk_distance
        take_profit = entry + risk_distance * 2
    else:
        stop_loss = entry + risk_distance
        take_profit = entry - risk_distance * 2

    if stop_loss <= 0 or take_profit <= 0:
        return None

    if direction == "BUY":
        if not stop_loss < entry < take_profit:
            return None
    else:
        if not take_profit < entry < stop_loss:
            return None

    return {
        "symbol": symbol,
        "market": "crypto",
        "timeframe": timeframe,
        "direction": direction,
        "grade": grade,
        "score": score,
        "confidence": None,
        "entry_price": entry,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "strategy": strategy,
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

    if signal.get("grade") not in {"S", "A"}:
        return False

    if signal.get("direction") not in {"BUY", "SELL"}:
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
    
