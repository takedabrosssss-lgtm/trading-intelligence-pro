
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BINANCE_INTERVALS = {
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "8h",
    "12h", "1d", "3d", "1w", "1M",
}


class MarketDataError(Exception):
    pass


class BinanceMarketData:
    """Public Binance Spot market data. No API key required."""

    def __init__(self):
        self.base_url = "https://data-api.binance.vision"
        self.timeout = settings.MARKET_DATA_TIMEOUT

    async def _get(self, endpoint: str, params: dict):
        url = f"{self.base_url}{endpoint}"

        try:
            async with httpx.AsyncClient(
                timeout=self.timeout
            ) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Binance HTTP error: %s",
                exc.response.status_code
            )
            raise MarketDataError(
                f"Market provider returned HTTP {exc.response.status_code}"
            ) from exc

        except httpx.RequestError as exc:
            logger.warning("Binance connection error: %s", exc)
            raise MarketDataError(
                "Market data provider is unavailable"
            ) from exc

    async def get_price(self, symbol: str) -> dict:
        symbol = symbol.upper().strip()

        data = await self._get(
            "/api/v3/ticker/price",
            {"symbol": symbol}
        )

        return {
            "symbol": data["symbol"],
            "price": float(data["price"]),
            "source": "Binance Spot",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def get_24h_ticker(self, symbol: str) -> dict:
        symbol = symbol.upper().strip()

        data = await self._get(
            "/api/v3/ticker/24hr",
            {"symbol": symbol}
        )

        return {
            "symbol": data["symbol"],
            "price": float(data["lastPrice"]),
            "change_percent": float(data["priceChangePercent"]),
            "high": float(data["highPrice"]),
            "low": float(data["lowPrice"]),
            "volume": float(data["volume"]),
            "source": "Binance Spot",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def get_klines(
        self,
        symbol: str,
        interval: str = "1h",
        limit: int = 200,
    ) -> list:
        symbol = symbol.upper().strip()

        if interval not in BINANCE_INTERVALS:
            raise ValueError("Unsupported candle interval")

        limit = max(1, min(int(limit), 1000))

        data = await self._get(
            "/api/v3/klines",
            {
                "symbol": symbol,
                "interval": interval,
                "limit": limit,
            }
        )

        candles = []

        for candle in data:
            candles.append({
                "time": int(candle[0] / 1000),
                "open": float(candle[1]),
                "high": float(candle[2]),
                "low": float(candle[3]),
                "close": float(candle[4]),
                "volume": float(candle[5]),
            })

        return candles

    async def get_multiple_prices(
        self,
        symbols: list
    ) -> list:
        results = []

        for symbol in symbols:
            try:
                result = await self.get_price(symbol)
                results.append(result)
            except (MarketDataError, ValueError) as exc:
                logger.warning(
                    "Could not fetch %s: %s",
                    symbol,
                    exc
                )

        return results

    async def health_check(self) -> bool:
        try:
            await self._get("/api/v3/ping", {})
            return True
        except MarketDataError:
            return False


market_data = BinanceMarketData()


async def get_market_price(symbol: str) -> Optional[float]:
    try:
        data = await market_data.get_price(symbol)
        return data["price"]
    except MarketDataError:
        return None
        
