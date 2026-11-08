
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = settings.binance_base_url

ALLOWED_INTERVALS = {
    "1m", "5m", "15m", "30m",
    "1h", "4h", "1d", "1w",
}


class MarketData:
    def __init__(self):
        self.timeout = settings.request_timeout_seconds

    async def _get(
        self,
        endpoint: str,
        params: dict | None = None,
    ) -> Any:
        url = f"{BASE_URL}{endpoint}"

        try:
            async with httpx.AsyncClient(
                timeout=self.timeout
            ) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                data = response.json()

            if isinstance(data, dict) and data.get("code"):
                raise RuntimeError(
                    f"Binance API error: {data.get('msg', 'Unknown error')}"
                )

            return data

        except httpx.TimeoutException as exc:
            logger.warning("Binance request timed out: %s", endpoint)
            raise RuntimeError("Market data request timed out") from exc

        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Binance HTTP error: %s",
                exc.response.status_code,
            )
            raise RuntimeError("Market data provider unavailable") from exc

        except (httpx.RequestError, ValueError) as exc:
            logger.warning("Binance request failed: %s", exc)
            raise RuntimeError("Invalid market data response") from exc

    async def get_price(self, symbol: str) -> dict:
        symbol = symbol.upper()

        data = await self._get(
            "/api/v3/ticker/price",
            {"symbol": symbol},
        )

        return {
            "symbol": data["symbol"],
            "price": float(data["price"]),
            "provider": "Binance Spot",
        }

    async def get_24h_ticker(self, symbol: str) -> dict:
        symbol = symbol.upper()

        data = await self._get(
            "/api/v3/ticker/24hr",
            {"symbol": symbol},
        )

        return {
            "symbol": data["symbol"],
            "lastPrice": float(data["lastPrice"]),
            "priceChange": float(data["priceChange"]),
            "priceChangePercent": float(data["priceChangePercent"]),
            "volume": float(data["volume"]),
            "quoteVolume": float(data["quoteVolume"]),
            "highPrice": float(data["highPrice"]),
            "lowPrice": float(data["lowPrice"]),
            "provider": "Binance Spot",
        }

    async def get_klines(
        self,
        symbol: str,
        interval: str = "1h",
        limit: int = 200,
    ) -> list[dict]:
        symbol = symbol.upper()

        if interval not in ALLOWED_INTERVALS:
            raise ValueError("Unsupported candle interval")

        limit = max(50, min(int(limit), 500))

        data = await self._get(
            "/api/v3/klines",
            {
                "symbol": symbol,
                "interval": interval,
                "limit": limit,
            },
        )

        candles = []

        for candle in data:
            candles.append({
                "timestamp": int(candle[0]),
                "open": float(candle[1]),
                "high": float(candle[2]),
                "low": float(candle[3]),
                "close": float(candle[4]),
                "volume": float(candle[5]),
            })

        return candles

    async def get_multiple_prices(
        self,
        symbols: list[str],
    ) -> list[dict]:
        results = []

        for symbol in symbols:
            try:
                results.append(await self.get_price(symbol))
            except Exception as exc:
                logger.warning(
                    "Unable to load %s: %s",
                    symbol,
                    exc,
                )

        return results

    async def health_check(self) -> bool:
        try:
            data = await self._get("/api/v3/ping")
            return isinstance(data, dict)
        except Exception:
            return False


market_data = MarketData()


async def get_market_price(symbol: str) -> float:
    result = await market_data.get_price(symbol)
    return result["price"]
    
