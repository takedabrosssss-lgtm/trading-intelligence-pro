
from datetime import datetime, timezone

from app.analyzer import analyze_market


MINIMUM_CANDLES = 50
RISK_REWARD_RATIO = 2.0

ELIGIBLE_GRADES = {"S", "A"}


def generate_signal(
    symbol: str,
    timeframe: str,
    candles: list[dict],
    strategy: str = "intraday",
) -> dict:
    if len(candles) < MINIMUM_CANDLES:
        raise ValueError("Insufficient candles for signal generation")

    analysis = analyze_market(candles)

    direction = analysis["direction"]
    score = analysis["score"]
    grade = analysis["grade"]
    entry = float(analysis["entry_price"])
    atr = analysis["indicators"]["atr"]

    signal = {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "strategy": strategy,
        "direction": direction,
        "grade": grade,
        "score": score,
        "entry_price": entry,
        "stop_loss": None,
        "take_profit": None,
        "reasoning": analysis["reasoning"],
        "indicators": analysis["indicators"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "new",
    }

    if direction == "NEUTRAL" or atr is None or atr <= 0:
        signal["status"] = "filtered"
        signal["filter_reason"] = "No directional confirmation or ATR unavailable"
        return signal

    risk_distance = float(atr) * 1.5

    if direction == "BUY":
        stop_loss = entry - risk_distance
        take_profit = entry + risk_distance * RISK_REWARD_RATIO
    else:
        stop_loss = entry + risk_distance
        take_profit = entry - risk_distance * RISK_REWARD_RATIO

    signal["stop_loss"] = stop_loss
    signal["take_profit"] = take_profit

    if score < 70 or grade not in ELIGIBLE_GRADES:
        signal["status"] = "filtered"
        signal["filter_reason"] = "Signal does not meet S/A quality threshold"
    else:
        signal["status"] = "eligible"

    return signal


def is_eligible_for_auto_paper_trade(signal: dict) -> bool:
    if signal.get("status") != "eligible":
        return False

    if signal.get("grade") not in ELIGIBLE_GRADES:
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
    new_signal: dict,
    existing_signals: list[dict],
) -> bool:
    for existing in existing_signals:
        if (
            existing.get("symbol") == new_signal.get("symbol")
            and existing.get("timeframe") == new_signal.get("timeframe")
            and existing.get("direction") == new_signal.get("direction")
            and existing.get("grade") == new_signal.get("grade")
            and existing.get("status") in {"new", "eligible"}
        ):
            return True

    return False
    
