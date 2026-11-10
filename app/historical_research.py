
"""Historical OHLCV loader for MIRAGE research.

Uses Binance Spot pagination. Does not modify trading or portfolio data.
"""
from __future__ import annotations

from typing import Any

from app.market_data import market_data


PAGE_SIZE = 500
MAX_CANDLES = 1500
VALID_INTERVALS = {"1h", "4h", "1d"}


def _parse(rows: list[list[Any]]) -> list[dict]:
    parsed = []

    for row in rows:
        try:
            parsed.append({
                "timestamp": int(row[0]),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            })
        except (IndexError, TypeError, ValueError):
            continue

    return parsed


async def load_historical_candles(
    symbol: str,
    interval: str,
    limit: int = 1200,
) -> list[dict]:
    """Load historical candles using Binance's paginated klines API."""

    symbol = symbol.upper()

    if not symbol.endswith("USDT"):
        raise ValueError("Unsupported symbol")

    if interval not in VALID_INTERVALS:
        raise ValueError("Unsupported historical interval")

    limit = max(240, min(int(limit), MAX_CANDLES))

    end_time = None
    collected: dict[int, dict] = {}

    while len(collected) < limit:
        page_limit = min(
            PAGE_SIZE,
            limit - len(collected),
        )

        params = {
            "symbol": symbol,
            "interval": interval,
            "limit": page_limit,
        }

        if end_time is not None:
            params["endTime"] = end_time

        rows = await market_data._get(
            "/api/v3/klines",
            params,
        )

        if not isinstance(rows, list) or not rows:
            break

        page = _parse(rows)

        if not page:
            break

        for candle in page:
            collected[candle["timestamp"]] = candle

        oldest = min(
            candle["timestamp"]
            for candle in page
        )

        next_end = oldest - 1

        if end_time is not None and next_end >= end_time:
            break

        end_time = next_end

        if len(page) < page_limit:
            break

    result = [
        collected[timestamp]
        for timestamp in sorted(collected)
    ]

    return result[-limit:]
      
