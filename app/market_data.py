import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = settings.binance_base_url
BYBIT_BASE_URL = settings.bybit_base_url

ALLOWED_INTERVALS = {
    "1m", "5m", "15m", "30m",
    "1h", "4h", "1d", "1w",
}

BYBIT_INTERVALS = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "4h": "240",
    "1d": "D",
    "1w": "W",
}


class MarketData:
    def __init__(self):
        self.timeout = settings.request_timeout_seconds

    async def _get(self, endpoint: str, params: dict | None = None) -> Any:
        url = f"{BASE_URL}{endpoint}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers={"Accept": "application/json", "User-Agent": "TradingIntelligencePRO/1.0"},
                )
                response.raise_for_status()
                data = response.json()

            if isinstance(data, dict) and data.get("code"):
                raise RuntimeError(f"Binance API error: {data.get('msg', 'Unknown error')}")
            return data
        except httpx.TimeoutException as exc:
            logger.warning("Binance request timed out: %s", endpoint)
            raise RuntimeError("Market data request timed out") from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("Binance HTTP error: %s", exc.response.status_code)
            raise RuntimeError(f"Binance HTTP {exc.response.status_code}") from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.warning("Binance request failed: %s", exc)
            raise RuntimeError("Invalid market data response") from exc

    async def _bybit_ticker(self, symbol: str) -> dict:
        url = f"{BYBIT_BASE_URL}/v5/market/tickers"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                url,
                params={"category": "spot", "symbol": symbol.upper()},
                headers={"Accept": "application/json", "User-Agent": "TradingIntelligencePRO/1.0"},
            )
            response.raise_for_status()
            payload = response.json()

        if payload.get("retCode") != 0:
            raise RuntimeError(f"Bybit API error: {payload.get('retMsg', 'Unknown error')}")
        items = payload.get("result", {}).get("list", [])
        if not items:
            raise RuntimeError(f"Bybit returned no ticker for {symbol}")
        return items[0]

    async def get_price(self, symbol: str) -> dict:
        symbol = symbol.upper()
        try:
            data = await self._get("/api/v3/ticker/price", {"symbol": symbol})
            return {"symbol": data["symbol"], "price": float(data["price"]), "provider": "Binance Spot"}
        except Exception as binance_error:
            logger.warning("Binance price unavailable for %s; trying Bybit: %s", symbol, binance_error)
            ticker = await self._bybit_ticker(symbol)
            return {"symbol": symbol, "price": float(ticker["lastPrice"]), "provider": "Bybit Spot"}

    async def get_24h_ticker(self, symbol: str) -> dict:
        symbol = symbol.upper()
        try:
            data = await self._get("/api/v3/ticker/24hr", {"symbol": symbol})
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
        except Exception as binance_error:
            logger.warning("Binance ticker unavailable for %s; trying Bybit: %s", symbol, binance_error)
            ticker = await self._bybit_ticker(symbol)
            last_price = float(ticker["lastPrice"])
            previous_price = float(ticker.get("prevPrice24h") or last_price)
            change = last_price - previous_price
            change_percent = float(ticker.get("price24hPcnt") or 0) * 100
            return {
                "symbol": symbol,
                "lastPrice": last_price,
                "priceChange": change,
                "priceChangePercent": change_percent,
                "volume": float(ticker.get("volume24h") or 0),
                "quoteVolume": float(ticker.get("turnover24h") or 0),
                "highPrice": float(ticker.get("highPrice24h") or last_price),
                "lowPrice": float(ticker.get("lowPrice24h") or last_price),
                "provider": "Bybit Spot",
            }

    async def get_klines(self, symbol: str, interval: str = "1h", limit: int = 200) -> list[dict]:
        symbol = symbol.upper()
        if interval not in ALLOWED_INTERVALS:
            raise ValueError("Unsupported candle interval")
        limit = max(50, min(int(limit), 1000))

        try:
            data = await self._get(
                "/api/v3/klines",
                {"symbol": symbol, "interval": interval, "limit": min(limit, 500)},
            )
            candles = [{
                "timestamp": int(c[0]),
                "open": float(c[1]),
                "high": float(c[2]),
                "low": float(c[3]),
                "close": float(c[4]),
                "volume": float(c[5]),
            } for c in data]
            logger.info("Market candles loaded from Binance: %s %s (%s)", symbol, interval, len(candles))
            return candles
        except Exception as binance_error:
            logger.warning("Binance klines unavailable for %s %s; falling back to Bybit: %s", symbol, interval, binance_error)

        url = f"{BYBIT_BASE_URL}/v5/market/kline"
        params = {
            "category": "spot",
            "symbol": symbol,
            "interval": BYBIT_INTERVALS[interval],
            "limit": min(limit, 1000),
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                url,
                params=params,
                headers={"Accept": "application/json", "User-Agent": "TradingIntelligencePRO/1.0"},
            )
            response.raise_for_status()
            payload = response.json()

        if payload.get("retCode") != 0:
            raise RuntimeError(f"Bybit API error: {payload.get('retMsg', 'Unknown error')}")

        rows = payload.get("result", {}).get("list", [])
        if not rows:
            raise RuntimeError(f"Bybit returned no candles for {symbol} {interval}")

        candles = [{
            "timestamp": int(c[0]),
            "open": float(c[1]),
            "high": float(c[2]),
            "low": float(c[3]),
            "close": float(c[4]),
            "volume": float(c[5]),
        } for c in rows]
        candles.sort(key=lambda candle: candle["timestamp"])
        logger.info("Market candles loaded from Bybit Spot: %s %s (%s)", symbol, interval, len(candles))
        return candles

    async def get_multiple_prices(self, symbols: list[str]) -> list[dict]:
        results = []
        for symbol in symbols:
            try:
                results.append(await self.get_price(symbol))
            except Exception as exc:
                logger.warning("Unable to load %s: %s", symbol, exc)
        return results

    async def health_check(self) -> bool:
        try:
            data = await self._get("/api/v3/ping")
            return isinstance(data, dict)
        except Exception:
            try:
                ticker = await self._bybit_ticker("BTCUSDT")
                return bool(ticker)
            except Exception:
                return False


market_data = MarketData()


async def get_market_price(symbol: str) -> float:
    result = await market_data.get_price(symbol)
    return result["price"]
