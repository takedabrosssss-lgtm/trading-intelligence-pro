
from math import isfinite


def _number(value, default=0.0):
    try:
        result = float(value)
        return result if isfinite(result) else default
    except (TypeError, ValueError):
        return default


def ema(values, period):
    if len(values) < period:
        return []

    multiplier = 2 / (period + 1)
    result = [sum(values[:period]) / period]

    for value in values[period:]:
        result.append(
            value * multiplier
            + result[-1] * (1 - multiplier)
        )

    return result


def sma(values, period):
    if len(values) < period:
        return None

    return sum(values[-period:]) / period


def calculate_rsi(closes, period=14):
    if len(closes) <= period:
        return None

    gains = []
    losses = []

    for index in range(1, len(closes)):
        change = closes[index] - closes[index - 1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))

    average_gain = sum(gains[:period]) / period
    average_loss = sum(losses[:period]) / period

    for index in range(period, len(gains)):
        average_gain = (
            average_gain * (period - 1) + gains[index]
        ) / period

        average_loss = (
            average_loss * (period - 1) + losses[index]
        ) / period

    if average_loss == 0:
        return 100.0 if average_gain > 0 else 50.0

    relative_strength = average_gain / average_loss
    return 100 - (100 / (1 + relative_strength))


def calculate_macd(closes):
    fast = ema(closes, 12)
    slow = ema(closes, 26)

    if not fast or not slow:
        return None

    offset = 26 - 12
    macd_line = [
        fast[index + offset] - slow[index]
        for index in range(len(slow))
    ]

    signal_line = ema(macd_line, 9)

    if not signal_line:
        return None

    macd_value = macd_line[-1]
    signal_value = signal_line[-1]

    return {
        "macd": macd_value,
        "signal": signal_value,
        "histogram": macd_value - signal_value,
    }


def calculate_bollinger(closes, period=20, multiplier=2):
    if len(closes) < period:
        return None

    middle = sma(closes, period)
    recent = closes[-period:]

    variance = sum(
        (value - middle) ** 2 for value in recent
    ) / period

    deviation = variance ** 0.5

    return {
        "upper": middle + multiplier * deviation,
        "middle": middle,
        "lower": middle - multiplier * deviation,
    }


def calculate_atr(candles, period=14):
    if len(candles) <= period:
        return None

    true_ranges = []

    for index in range(1, len(candles)):
        current = candles[index]
        previous = candles[index - 1]

        high = _number(current.get("high"))
        low = _number(current.get("low"))
        previous_close = _number(previous.get("close"))

        true_range = max(
            high - low,
            abs(high - previous_close),
            abs(low - previous_close),
        )

        true_ranges.append(true_range)

    if len(true_ranges) < period:
        return None

    value = sum(true_ranges[:period]) / period

    for current in true_ranges[period:]:
        value = (
            value * (period - 1) + current
        ) / period

    return value


def calculate_volume_ratio(candles, period=20):
    if len(candles) < period + 1:
        return None

    previous_volumes = [
        _number(candle.get("volume"))
        for candle in candles[-period - 1:-1]
    ]

    average = sum(previous_volumes) / period

    if average <= 0:
        return None

    return _number(candles[-1].get("volume")) / average


def analyze_market(candles):
    if not isinstance(candles, list) or len(candles) < 50:
        raise ValueError("At least 50 candles are required")

    closes = [
        _number(candle.get("close"))
        for candle in candles
    ]

    if any(value <= 0 for value in closes):
        raise ValueError("Invalid candle close price")

    current_price = closes[-1]

    ema20_values = ema(closes, 20)
    ema50_values = ema(closes, 50)

    if not ema20_values or not ema50_values:
        raise ValueError("Unable to calculate moving averages")

    ema20 = ema20_values[-1]
    ema50 = ema50_values[-1]

    rsi = calculate_rsi(closes)
    macd = calculate_macd(closes)
    bollinger = calculate_bollinger(closes)
    atr = calculate_atr(candles)
    volume_ratio = calculate_volume_ratio(candles)

    score = 50
    reasons = []

    if current_price > ema20:
        score += 10
        reasons.append("Цена выше EMA 20")
    else:
        score -= 10
        reasons.append("Цена ниже EMA 20")

    if ema20 > ema50:
        score += 15
        reasons.append("EMA 20 выше EMA 50")
    else:
        score -= 15
        reasons.append("EMA 20 ниже EMA 50")

    if rsi is not None:
        if 50 < rsi < 70:
            score += 10
            reasons.append("RSI подтверждает бычий импульс")
        elif 30 < rsi < 50:
            score -= 10
            reasons.append("RSI подтверждает медвежий импульс")
        elif rsi >= 70:
            reasons.append("RSI: зона перекупленности")
        elif rsi <= 30:
            reasons.append("RSI: зона перепроданности")

    if macd:
        if macd["histogram"] > 0:
            score += 10
            reasons.append("MACD: положительный импульс")
        elif macd["histogram"] < 0:
            score -= 10
            reasons.append("MACD: отрицательный импульс")

    if bollinger:
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

    if score >= 85:
        grade = "S"
    elif score >= 70 or score <= 30:
        grade = "A"
    elif score >= 60 or score <= 40:
        grade = "B"
    else:
        grade = "C"

    return {
        "direction": direction,
        "signal": direction,
        "score": score,
        "confluence_score": score,
        "grade": grade,
        "entry_price": current_price,
        "indicators": {
            "ema_20": ema20,
            "ema_50": ema50,
            "rsi": rsi,
            "macd": macd,
            "bollinger": bollinger,
            "atr": atr,
            "volume_ratio": volume_ratio,
        },
        "reasoning": reasons,
    }
    
