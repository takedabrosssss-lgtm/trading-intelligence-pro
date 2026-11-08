
from typing import Any


def sma(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        return []

    return [
        sum(values[i - period + 1:i + 1]) / period
        for i in range(period - 1, len(values))
    ]


def ema(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        return []

    multiplier = 2 / (period + 1)
    result = [sum(values[:period]) / period]

    for value in values[period:]:
        result.append(
            (value - result[-1]) * multiplier + result[-1]
        )

    return result


def calculate_rsi(values: list[float], period: int = 14) -> float | None:
    if len(values) <= period:
        return None

    changes = [
        values[i] - values[i - 1]
        for i in range(1, len(values))
    ]

    gains = [max(change, 0) for change in changes]
    losses = [max(-change, 0) for change in changes]

    average_gain = sum(gains[:period]) / period
    average_loss = sum(losses[:period]) / period

    for i in range(period, len(changes)):
        average_gain = (
            average_gain * (period - 1) + gains[i]
        ) / period
        average_loss = (
            average_loss * (period - 1) + losses[i]
        ) / period

    if average_loss == 0:
        return 100.0 if average_gain > 0 else 50.0

    relative_strength = average_gain / average_loss
    return 100 - (100 / (1 + relative_strength))


def calculate_atr(
    candles: list[dict[str, Any]],
    period: int = 14,
) -> float | None:
    if len(candles) <= period:
        return None

    true_ranges = []

    for i in range(1, len(candles)):
        current = candles[i]
        previous_close = float(candles[i - 1]["close"])

        high = float(current["high"])
        low = float(current["low"])

        true_ranges.append(
            max(
                high - low,
                abs(high - previous_close),
                abs(low - previous_close),
            )
        )

    return sum(true_ranges[-period:]) / period


def calculate_macd(
    values: list[float],
) -> dict[str, float] | None:
    fast = ema(values, 12)
    slow = ema(values, 26)

    if not fast or not slow:
        return None

    macd_line = fast[-1] - slow[-1]

    return {
        "macd": macd_line,
        "signal": 0.0,
        "histogram": macd_line,
    }


def calculate_bollinger(
    values: list[float],
    period: int = 20,
) -> dict[str, float] | None:
    if len(values) < period:
        return None

    window = values[-period:]
    middle = sum(window) / period

    variance = sum(
        (value - middle) ** 2 for value in window
    ) / period

    deviation = variance ** 0.5

    return {
        "upper": middle + 2 * deviation,
        "middle": middle,
        "lower": middle - 2 * deviation,
    }


def analyze_market(
    candles: list[dict[str, Any]],
) -> dict[str, Any]:
    if not candles or len(candles) < 50:
        raise ValueError("At least 50 candles are required")

    closes = [float(candle["close"]) for candle in candles]

    if any(value <= 0 for value in closes):
        raise ValueError("Candle close prices must be positive")

    current_price = closes[-1]

    ema20_values = ema(closes, 20)
    ema50_values = ema(closes, 50)
    rsi = calculate_rsi(closes)
    macd = calculate_macd(closes)
    atr = calculate_atr(candles)
    bollinger = calculate_bollinger(closes)

    if not ema20_values or not ema50_values:
        raise ValueError("Not enough data for EMA calculation")

    ema20_value = ema20_values[-1]
    ema50_value = ema50_values[-1]

    score = 50
    reasoning = []

    if current_price > ema20_value:
        score += 10
        reasoning.append("Price above EMA20")
    else:
        score -= 10
        reasoning.append("Price below EMA20")

    if ema20_value > ema50_value:
        score += 15
        reasoning.append("Bullish EMA alignment")
    else:
        score -= 15
        reasoning.append("Bearish EMA alignment")

    if rsi is not None:
        if rsi > 55:
            score += 10
            reasoning.append("RSI bullish momentum")
        elif rsi < 45:
            score -= 10
            reasoning.append("RSI bearish momentum")

    if macd is not None:
        if macd["histogram"] > 0:
            score += 10
            reasoning.append("MACD bullish")
        elif macd["histogram"] < 0:
            score -= 10
            reasoning.append("MACD bearish")

    if bollinger is not None:
        if current_price > bollinger["middle"]:
            score += 5
        else:
            score -= 5

    score = max(0, min(100, score))

    if score >= 65:
        direction = "BUY"
    elif score <= 35:
        direction = "SELL"
    else:
        direction = "NEUTRAL"

    if score >= 85 or score <= 15:
        grade = "S"
    elif score >= 70 or score <= 30:
        grade = "A"
    elif score >= 60 or score <= 40:
        grade = "B"
    else:
        grade = "C"

    return {
        "direction": direction,
        "score": score,
        "grade": grade,
        "entry_price": current_price,
        "indicators": {
            "ema20": ema20_value,
            "ema50": ema50_value,
            "rsi": rsi,
            "macd": macd,
            "atr": atr,
            "bollinger": bollinger,
        },
        "reasoning": reasoning,
    }
    
