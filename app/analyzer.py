from typing import Any


def sma(values: list[float], period: int) -> list[float]:
    if period <= 0 or len(values) < period:
        return []
    return [
        sum(values[i - period + 1:i + 1]) / period
        for i in range(period - 1, len(values))
    ]


def ema(values: list[float], period: int) -> list[float]:
    if period <= 0 or len(values) < period:
        return []

    multiplier = 2 / (period + 1)
    result = [sum(values[:period]) / period]

    for value in values[period:]:
        result.append(result[-1] + multiplier * (value - result[-1]))

    return result


def calculate_rsi(values: list[float], period: int = 14) -> float | None:
    if period <= 0 or len(values) <= period:
        return None

    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    gains = [max(change, 0.0) for change in changes]
    losses = [max(-change, 0.0) for change in changes]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(changes)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0

    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def calculate_atr(
    candles: list[dict[str, Any]],
    period: int = 14,
) -> float | None:
    if period <= 0 or len(candles) <= period:
        return None

    ranges = []

    for i in range(1, len(candles)):
        current = candles[i]
        previous_close = float(candles[i - 1]["close"])

        high = float(current["high"])
        low = float(current["low"])

        ranges.append(max(
            high - low,
            abs(high - previous_close),
            abs(low - previous_close),
        ))

    if len(ranges) < period:
        return None

    atr = sum(ranges[:period]) / period

    for value in ranges[period:]:
        atr = (atr * (period - 1) + value) / period

    return atr


def calculate_macd(
    values: list[float],
) -> dict[str, float] | None:
    if len(values) < 35:
        return None

    fast = ema(values, 12)
    slow = ema(values, 26)

    if not fast or not slow:
        return None

    # EMA(12) starts at index 11; EMA(26) starts at index 25.
    # Align both series at the same candle before subtraction.
    offset = 26 - 12
    macd_series = [
        fast[offset + i] - slow[i]
        for i in range(len(slow))
    ]

    signal_series = ema(macd_series, 9)
    if not signal_series:
        return None

    macd_line = macd_series[-1]
    signal_line = signal_series[-1]

    return {
        "macd": macd_line,
        "signal": signal_line,
        "histogram": macd_line - signal_line,
    }


def calculate_bollinger(
    values: list[float],
    period: int = 20,
    deviations: float = 2.0,
) -> dict[str, float] | None:
    if len(values) < period:
        return None

    window = values[-period:]
    middle = sum(window) / period
    variance = sum((value - middle) ** 2 for value in window) / period
    deviation = variance ** 0.5

    return {
        "upper": middle + deviations * deviation,
        "middle": middle,
        "lower": middle - deviations * deviation,
        "width": (4 * deviation / middle) if middle else 0.0,
    }


def calculate_adx(
    candles: list[dict[str, Any]],
    period: int = 14,
) -> dict[str, float] | None:
    if period <= 0 or len(candles) < period * 2 + 1:
        return None

    plus_dm = []
    minus_dm = []
    true_ranges = []

    for i in range(1, len(candles)):
        current = candles[i]
        previous = candles[i - 1]

        up_move = float(current["high"]) - float(previous["high"])
        down_move = float(previous["low"]) - float(current["low"])

        plus_dm.append(up_move if up_move > down_move and up_move > 0 else 0.0)
        minus_dm.append(down_move if down_move > up_move and down_move > 0 else 0.0)

        high = float(current["high"])
        low = float(current["low"])
        previous_close = float(previous["close"])

        true_ranges.append(max(
            high - low,
            abs(high - previous_close),
            abs(low - previous_close),
        ))

    if len(true_ranges) < period * 2:
        return None

    tr = sum(true_ranges[:period])
    plus = sum(plus_dm[:period])
    minus = sum(minus_dm[:period])

    dx_values = []

    for i in range(period, len(true_ranges)):
        tr = tr - tr / period + true_ranges[i]
        plus = plus - plus / period + plus_dm[i]
        minus = minus - minus / period + minus_dm[i]

        if tr <= 0:
            dx_values.append(0.0)
            continue

        plus_di = 100.0 * plus / tr
        minus_di = 100.0 * minus / tr
        denominator = plus_di + minus_di

        dx = (
            100.0 * abs(plus_di - minus_di) / denominator
            if denominator > 0 else 0.0
        )
        dx_values.append(dx)

    if len(dx_values) < period:
        return None

    adx = sum(dx_values[:period]) / period

    for value in dx_values[period:]:
        adx = (adx * (period - 1) + value) / period

    return {
        "adx": adx,
        "plus_di": plus_di,
        "minus_di": minus_di,
    }


def calculate_volume_ratio(
    candles: list[dict[str, Any]],
    period: int = 20,
) -> float | None:
    if len(candles) < period + 1:
        return None

    previous_volumes = [
        float(candle.get("volume", 0))
        for candle in candles[-period - 1:-1]
    ]

    average = sum(previous_volumes) / len(previous_volumes)
    current = float(candles[-1].get("volume", 0))

    if average <= 0:
        return None

    return current / average


def _indicators(candles: list[dict[str, Any]]) -> dict[str, Any]:
    closes = [float(c["close"]) for c in candles]

    ema20 = ema(closes, 20)
    ema50 = ema(closes, 50)

    return {
        "ema20": ema20[-1] if ema20 else None,
        "ema50": ema50[-1] if ema50 else None,
        "ema20_previous": ema20[-2] if len(ema20) > 1 else None,
        "ema50_previous": ema50[-2] if len(ema50) > 1 else None,
        "rsi": calculate_rsi(closes),
        "macd": calculate_macd(closes),
        "atr": calculate_atr(candles),
        "adx": calculate_adx(candles),
        "bollinger": calculate_bollinger(closes),
        "volume_ratio": calculate_volume_ratio(candles),
    }


def _result(
    direction: str,
    score: float,
    price: float,
    indicators: dict[str, Any],
    strategy: str,
    reasons: list[str],
) -> dict[str, Any]:
    score = max(0.0, min(100.0, score))

    strength = score if direction == "BUY" else 100.0 - score

    if strength >= 90:
        grade = "S"
    elif strength >= 80:
        grade = "A"
    elif strength >= 70:
        grade = "B"
    else:
        grade = "C"

    return {
        "direction": direction,
        "score": round(score, 2),
        "confidence": round(strength, 2),
        "grade": grade,
        "entry_price": price,
        "strategy_model": strategy,
        "indicators": indicators,
        "reasoning": reasons,
    }




def analyze_strategy(
    candles: list[dict[str, Any]],
    strategy: str,
    diagnostics: dict[str, Any] | None = None,
) -> dict[str, Any] | None:

    def reject(reason):
        if diagnostics is not None:
            diagnostics["reason"] = reason
        return None

    if len(candles) < 100:
        return reject("insufficient_candles")

    indicators = _indicators(candles)
    price = float(candles[-1]["close"])

    ema20 = indicators["ema20"]
    ema50 = indicators["ema50"]
    rsi = indicators["rsi"]
    macd = indicators["macd"]
    atr = indicators["atr"]
    adx_data = indicators["adx"]
    volume_ratio = indicators["volume_ratio"]

    if not all((ema20, ema50, rsi is not None, macd, atr, adx_data)):
        return reject("missing_indicators")

    if price <= 0 or atr <= 0:
        return reject("invalid_market_values")

    adx = adx_data["adx"]
    histogram = macd["histogram"]

    bullish = ema20 > ema50
    bearish = ema20 < ema50

    direction = "NEUTRAL"
    score = 50.0
    reasons = []

    # 1. TREND FOLLOWING
    if strategy == "trend_following":

        if adx < 18:
            return reject("trend_adx_below_18")

        if bullish and price > ema20 and histogram > 0 and 52 <= rsi <= 72:
            direction = "BUY"
            score = 82 + min(8, (adx - 18) * 0.35)
            reasons = [
                "EMA20 above EMA50",
                "Price above EMA20",
                "Positive MACD histogram",
                "RSI confirms bullish momentum",
                "ADX confirms trend strength",
            ]

        elif bearish and price < ema20 and histogram < 0 and 28 <= rsi <= 48:
            direction = "SELL"
            score = 18 - min(8, (adx - 18) * 0.35)
            reasons = [
                "EMA20 below EMA50",
                "Price below EMA20",
                "Negative MACD histogram",
                "RSI confirms bearish momentum",
                "ADX confirms trend strength",
            ]

    # 2. EMA PULLBACK
    elif strategy == "ema_pullback":

        previous_close = float(candles[-2]["close"])
        previous_ema20 = indicators["ema20_previous"]

        if previous_ema20 is None:
            return reject("pullback_missing_ema")

        if adx < 16:
            return reject("pullback_adx_below_16")

        if (
            bullish
            and previous_close <= previous_ema20
            and price > ema20
            and histogram > 0
            and 48 <= rsi <= 68
        ):
            direction = "BUY"
            score = 83 + min(7, (adx - 16) * 0.3)
            reasons = [
                "Higher-timeframe bullish EMA alignment",
                "Pullback to EMA20 and close reclaim",
                "MACD momentum turned positive",
                "RSI confirms recovery",
            ]

        elif (
            bearish
            and previous_close >= previous_ema20
            and price < ema20
            and histogram < 0
            and 32 <= rsi <= 52
        ):
            direction = "SELL"
            score = 17 - min(7, (adx - 16) * 0.3)
            reasons = [
                "Higher-timeframe bearish EMA alignment",
                "Pullback to EMA20 and close rejection",
                "MACD momentum turned negative",
                "RSI confirms weakness",
            ]

    # 3. BREAKOUT
    elif strategy == "breakout":

        if len(candles) < 30:
            return reject("breakout_insufficient_candles")

        if adx < 18:
            return reject("breakout_adx_below_18")

        if volume_ratio is None:
            return reject("breakout_missing_volume")

        previous = candles[-21:-1]

        range_high = max(float(c["high"]) for c in previous)
        range_low = min(float(c["low"]) for c in previous)

        if (
            price > range_high
            and bullish
            and histogram > 0
            and volume_ratio >= 1.2
            and 50 <= rsi <= 75
        ):
            direction = "BUY"
            score = 84 + min(6, (volume_ratio - 1.2) * 5)
            reasons = [
                "Close above previous 20-candle high",
                "Volume above 20-candle average",
                "Bullish EMA alignment",
                "Positive MACD momentum",
            ]

        elif (
            price < range_low
            and bearish
            and histogram < 0
            and volume_ratio >= 1.2
            and 25 <= rsi <= 50
        ):
            direction = "SELL"
            score = 16 - min(6, (volume_ratio - 1.2) * 5)
            reasons = [
                "Close below previous 20-candle low",
                "Volume above 20-candle average",
                "Bearish EMA alignment",
                "Negative MACD momentum",
            ]

    else:
        raise ValueError(f"Unknown strategy: {strategy}")

    if direction == "NEUTRAL":
        return reject(f"{strategy}_no_setup")

    if diagnostics is not None:
        diagnostics["reason"] = "candidate"

    return _result(
        direction,
        score,
        price,
        indicators,
        strategy,
        reasons,
    )
    


def analyze_market(
    candles: list[dict[str, Any]],
) -> dict[str, Any]:
    if len(candles) < 100:
        raise ValueError("At least 100 candles are required")

    indicators = _indicators(candles)
    price = float(candles[-1]["close"])

    ema20 = indicators["ema20"]
    ema50 = indicators["ema50"]
    rsi = indicators["rsi"]
    macd = indicators["macd"]

    score = 50.0
    reasons = []

    if ema20 is not None and price > ema20:
        score += 10
        reasons.append("Price above EMA20")
    elif ema20 is not None:
        score -= 10
        reasons.append("Price below EMA20")

    if ema20 is not None and ema50 is not None:
        if ema20 > ema50:
            score += 15
            reasons.append("Bullish EMA alignment")
        elif ema20 < ema50:
            score -= 15
            reasons.append("Bearish EMA alignment")

    if rsi is not None:
        if rsi > 55:
            score += 10
        elif rsi < 45:
            score -= 10

    if macd:
        if macd["histogram"] > 0:
            score += 10
            reasons.append("Positive MACD histogram")
        elif macd["histogram"] < 0:
            score -= 10
            reasons.append("Negative MACD histogram")

    score = max(0.0, min(100.0, score))

    direction = (
        "BUY" if score >= 65
        else "SELL" if score <= 35
        else "NEUTRAL"
    )

    grade = (
        "S" if score >= 85 or score <= 15
        else "A" if score >= 70 or score <= 30
        else "B" if score >= 60 or score <= 40
        else "C"
    )

    return {
        "direction": direction,
        "score": score,
        "grade": grade,
        "entry_price": price,
        "indicators": indicators,
        "reasoning": reasons,
    }
