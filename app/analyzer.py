
import math
from typing import Optional


def ema(values: list[float], period: int) -> list[Optional[float]]:
    if period <= 0:
        raise ValueError("Period must be positive")

    result = [None] * len(values)

    if len(values) < period:
        return result

    current = sum(values[:period]) / period
    result[period - 1] = current

    multiplier = 2 / (period + 1)

    for i in range(period, len(values)):
        current = (
            values[i] * multiplier
            + current * (1 - multiplier)
        )
        result[i] = current

    return result


def sma(values: list[float], period: int) -> list[Optional[float]]:
    result = [None] * len(values)

    if period <= 0:
        raise ValueError("Period must be positive")

    for i in range(period - 1, len(values)):
        result[i] = sum(
            values[i - period + 1:i + 1]
        ) / period

    return result


def rsi(values: list[float], period: int = 14) -> list[Optional[float]]:
    result = [None] * len(values)

    if period <= 0 or len(values) <= period:
        return result

    gains = []
    losses = []

    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    def calculate(gain, loss):
        if loss == 0:
            return 100.0 if gain > 0 else 50.0
        rs = gain / loss
        return 100 - (100 / (1 + rs))

    result[period] = calculate(avg_gain, avg_loss)

    for i in range(period + 1, len(values)):
        gain = gains[i - 1]
        loss = losses[i - 1]

        avg_gain = (
            avg_gain * (period - 1) + gain
        ) / period

        avg_loss = (
            avg_loss * (period - 1) + loss
        ) / period

        result[i] = calculate(avg_gain, avg_loss)

    return result


def macd(
    values: list[float],
    fast: int = 12,
    slow: int = 26,
    signal_period: int = 9,
) -> dict:
    fast_values = ema(values, fast)
    slow_values = ema(values, slow)

    macd_line = [None] * len(values)

    for i in range(len(values)):
        if fast_values[i] is not None and slow_values[i] is not None:
            macd_line[i] = fast_values[i] - slow_values[i]

    valid_start = next(
        (i for i, value in enumerate(macd_line) if value is not None),
        len(values)
    )

    valid_macd = macd_line[valid_start:]
    signal_valid = ema(valid_macd, signal_period)

    signal_line = [None] * len(values)
    histogram = [None] * len(values)

    for offset, value in enumerate(signal_valid):
        index = valid_start + offset
        signal_line[index] = value

        if value is not None:
            histogram[index] = macd_line[index] - value

    return {
        "macd": macd_line,
        "signal": signal_line,
        "histogram": histogram,
    }


def bollinger_bands(
    values: list[float],
    period: int = 20,
    deviations: float = 2.0,
) -> dict:
    middle = sma(values, period)
    upper = [None] * len(values)
    lower = [None] * len(values)

    for i in range(period - 1, len(values)):
        window = values[i - period + 1:i + 1]
        mean = middle[i]

        variance = sum(
            (value - mean) ** 2 for value in window
        ) / period

        standard_deviation = math.sqrt(variance)

        upper[i] = mean + deviations * standard_deviation
        lower[i] = mean - deviations * standard_deviation

    return {
        "upper": upper,
        "middle": middle,
        "lower": lower,
    }


def atr(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    period: int = 14,
) -> list[Optional[float]]:
    length = min(len(highs), len(lows), len(closes))
    result = [None] * length

    if period <= 0 or length <= period:
        return result

    true_ranges = []

    for i in range(length):
        if i == 0:
            tr = highs[i] - lows[i]
        else:
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1]),
            )

        true_ranges.append(tr)

    current = sum(true_ranges[:period]) / period
    result[period - 1] = current

    for i in range(period, length):
        current = (
            current * (period - 1) + true_ranges[i]
        ) / period

        result[i] = current

    return result


def analyze_market(candles: list[dict]) -> dict:
    """
    Analyze OHLCV candles.
    Confidence is a technical confluence score, not a win probability.
    """

    if len(candles) < 50:
        return {
            "status": "insufficient_data",
            "message": "At least 50 candles are required.",
        }

    try:
        closes = [float(c["close"]) for c in candles]
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        volumes = [float(c.get("volume", 0)) for c in candles]

        if not all(
            math.isfinite(value)
            for value in closes + highs + lows + volumes
        ):
            raise ValueError("Non-finite market data")

        if any(value <= 0 for value in closes):
            raise ValueError("Invalid closing price")

        if any(h < l for h, l in zip(highs, lows)):
            raise ValueError("Invalid candle range")

    except (KeyError, TypeError, ValueError) as exc:
        return {
            "status": "invalid_data",
            "message": str(exc),
        }

    ema20 = ema(closes, 20)
    ema50 = ema(closes, 50)
    rsi_values = rsi(closes)
    macd_values = macd(closes)
    bands = bollinger_bands(closes)
    atr_values = atr(highs, lows, closes)

    last = -1
    price = closes[last]

    values = {
        "ema20": ema20[last],
        "ema50": ema50[last],
        "rsi": rsi_values[last],
        "macd": macd_values["macd"][last],
        "macd_signal": macd_values["signal"][last],
        "macd_histogram": macd_values["histogram"][last],
        "bb_upper": bands["upper"][last],
        "bb_middle": bands["middle"][last],
        "bb_lower": bands["lower"][last],
        "atr": atr_values[last],
    }

    if any(value is None for value in values.values()):
        return {
            "status": "insufficient_data",
            "message": "Indicators could not be calculated.",
        }

    bullish = 0
    bearish = 0
    reasons = []

    if price > values["ema20"] > values["ema50"]:
        bullish += 2
        reasons.append("Price is above EMA20 and EMA50")
    elif price < values["ema20"] < values["ema50"]:
        bearish += 2
        reasons.append("Price is below EMA20 and EMA50")

    if values["rsi"] >= 55:
        bullish += 1
        reasons.append("RSI shows bullish momentum")
    elif values["rsi"] <= 45:
        bearish += 1
        reasons.append("RSI shows bearish momentum")

    if values["macd_histogram"] > 0:
        bullish += 1
        reasons.append("MACD histogram is positive")
    elif values["macd_histogram"] < 0:
        bearish += 1
        reasons.append("MACD histogram is negative")

    if price > values["bb_middle"]:
        bullish += 1
    elif price < values["bb_middle"]:
        bearish += 1

    if bullish > bearish:
        direction = "BUY"
    elif bearish > bullish:
        direction = "SELL"
    else:
        direction = "NEUTRAL"

    total_score = max(bullish, bearish)
    confidence = round(total_score / 5 * 100, 1)

    if direction == "NEUTRAL":
        grade = "C"
    elif confidence >= 80:
        grade = "S"
    elif confidence >= 60:
        grade = "A"
    elif confidence >= 40:
        grade = "B"
    else:
        grade = "C"

    volume_average = (
        sum(volumes[-20:]) / min(20, len(volumes))
        if volumes else 0
    )

    volume_ratio = (
        volumes[-1] / volume_average
        if volume_average > 0 else None
    )

    return {
        "status": "ok",
        "direction": direction,
        "grade": grade,
        "confidence_score": confidence,
        "confidence_description": (
            "Technical confluence score; not a probability of profit."
        ),
        "price": price,
        "indicators": {
            "ema20": round(values["ema20"], 8),
            "ema50": round(values["ema50"], 8),
            "rsi14": round(values["rsi"], 2),
            "macd": round(values["macd"], 8),
            "macd_signal": round(values["macd_signal"], 8),
            "macd_histogram": round(
                values["macd_histogram"], 8
            ),
            "bollinger_upper": round(values["bb_upper"], 8),
            "bollinger_middle": round(values["bb_middle"], 8),
            "bollinger_lower": round(values["bb_lower"], 8),
            "atr14": round(values["atr"], 8),
            "volume_ratio": (
                round(volume_ratio, 2)
                if volume_ratio is not None else None
            ),
        },
        "reasons": reasons,
            }
    
