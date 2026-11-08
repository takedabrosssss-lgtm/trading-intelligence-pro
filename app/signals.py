
import logging
from datetime import datetime, timezone

from app.analyzer import analyze_market

logger = logging.getLogger(__name__)

VALID_GRADES = {"S", "A", "B", "C"}


def generate_signal(
    symbol: str,
    candles: list[dict],
    market: str = "crypto",
    timeframe: str = "1h",
    strategy: str = "intraday",
) -> dict:
    """Generate a structured signal from market candles."""

    symbol = symbol.upper().strip()

    analysis = analyze_market(candles)

    if analysis.get("status") != "ok":
        return {
            "status": analysis.get("status", "error"),
            "symbol": symbol,
            "message": analysis.get(
                "message",
                "Market analysis failed."
            ),
        }

    direction = analysis["direction"]
    price = float(analysis["price"])
    indicators = analysis["indicators"]
    grade = analysis["grade"]

    if direction not in {"BUY", "SELL"}:
        return {
            "status": "no_signal",
            "symbol": symbol,
            "market": market,
            "timeframe": timeframe,
            "analysis": analysis,
        }

    atr_value = float(indicators["atr14"])

    if atr_value <= 0 or price <= 0:
        return {
            "status": "invalid_data",
            "symbol": symbol,
            "message": "Invalid price or ATR.",
        }

    # Conservative initial risk model.
    stop_distance = atr_value * 1.5
    reward_distance = atr_value * 3.0

    if direction == "BUY":
        stop_loss = price - stop_distance
        take_profit = price + reward_distance
    else:
        stop_loss = price + stop_distance
        take_profit = price - reward_distance

    risk_percent = abs(price - stop_loss) / price * 100
    reward_percent = abs(take_profit - price) / price * 100

    signal = {
        "status": "new",
        "symbol": symbol,
        "market": market,
        "timeframe": timeframe,
        "direction": direction,
        "grade": grade,
        "confidence_score": analysis["confidence_score"],
        "confidence_description": analysis[
            "confidence_description"
        ],
        "strategy": strategy,
        "entry_price": round(price, 10),
        "stop_loss": round(stop_loss, 10),
        "take_profit": round(take_profit, 10),
        "risk_reward_ratio": round(
            reward_distance / stop_distance, 2
        ),
        "risk_percent": round(risk_percent, 4),
        "potential_reward_percent": round(
            reward_percent, 4
        ),
        "indicators": indicators,
        "reasoning": analysis["reasons"],
        "created_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "execution_mode": "paper_only",
    }

    return signal


def is_eligible_for_auto_paper_trade(signal: dict) -> bool:
    """
    Only S and A signals may be considered by the paper trader.
    This function does not execute trades.
    """

    if signal.get("status") != "new":
        return False

    if signal.get("direction") not in {"BUY", "SELL"}:
        return False

    return signal.get("grade") in {"S", "A"}


def filter_signals(
    signals: list[dict],
    minimum_grade: str = "B",
) -> list[dict]:
    """Filter signals by minimum grade."""

    grade_order = {
        "S": 4,
        "A": 3,
        "B": 2,
        "C": 1,
    }

    minimum_grade = minimum_grade.upper()

    if minimum_grade not in grade_order:
        raise ValueError("Invalid minimum grade")

    filtered = []

    for signal in signals:
        grade = signal.get("grade")

        if grade not in VALID_GRADES:
            continue

        if grade_order[grade] >= grade_order[minimum_grade]:
            filtered.append(signal)

    return filtered


def deduplicate_signals(
    signals: list[dict],
) -> list[dict]:
    """Keep only the newest signal for each symbol/timeframe/direction."""

    unique = {}

    for signal in signals:
        key = (
            signal.get("symbol"),
            signal.get("timeframe"),
            signal.get("direction"),
            signal.get("strategy"),
        )

        previous = unique.get(key)

        if previous is None or (
            signal.get("created_at", "")
            > previous.get("created_at", "")
        ):
            unique[key] = signal

    return list(unique.values())
    
