import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = settings.binance_base_url
KRAKEN_BASE_URL = "https://api.kraken.com"

ALLOWED_INTERVALS = {
    "1m", "5m", "15m", "30m",
    "1h", "4h", "1d", "1w",
}

KRAKEN_INTERVALS = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
    "1w": 10080,
}

# Kraken uses XBT for Bitcoin and XDG for Dogecoin in its public API.
# BNB is quoted against USD on Kraken; the resulting USD price is effectively
# comparable to the USDT-denominated symbol for signal analysis.
KRAKEN_PAIRS = {
    "BTCUSDT": "XBTUSDT",
    "DOGEUSDT": "XDGUSDT",
    "BNBUSDT": "BNBUSD",
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
                    headers={
                        "Accept": "application/json",
                        "User-Agent": "TradingIntelligencePRO/1.0",
                    },
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

    def _kraken_pair(self, symbol: str) -> str:
        return KRAKEN_PAIRS.get(symbol.upper(), symbol.upper())

    async def _kraken_get(self, endpoint: str, params: dict | None = None) -> dict:
        url = f"{KRAKEN_BASE_URL}/0/public/{endpoint}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                url,
                params=params,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "TradingIntelligencePRO/1.0",
                },
            )
            response.raise_for_status()
            payload = response.json()

        errors = payload.get("error") or []
        if errors:
            raise RuntimeError("Kraken API error: " + "; ".join(errors))

        result = payload.get("result") or {}
        if not result:
            raise RuntimeError("Kraken returned an empty result")
        return result

    def _kraken_result_value(self, result: dict):
        for key, value in result.items():
            if key != "last":
                return value
        raise RuntimeError("Kraken response contains no market data")

    async def _kraken_ticker(self, symbol: str) -> dict:
        result = await self._kraken_get(
            "Ticker",
            {"pair": self._kraken_pair(symbol)},
        )
        ticker = self._kraken_result_value(result)
        if not isinstance(ticker, dict) or "c" not in ticker:
            raise RuntimeError(f"Kraken returned no ticker for {symbol}")
        return ticker

    async def get_price(self, symbol: str) -> dict:
        symbol = symbol.upper()
        try:
            data = await self._get("/api/v3/ticker/price", {"symbol": symbol})
            return {
                "symbol": symbol,
                "price": float(data["price"]),
                "provider": "Binance Spot",
            }
        except Exception as binance_error:
            logger.warning(
                "Binance price unavailable for %s; falling back to Kraken: %s",
                symbol,
                binance_error,
            )

        ticker = await self._kraken_ticker(symbol)
        return {
            "symbol": symbol,
            "price": float(ticker["c"][0]),
            "provider": "Kraken Spot",
        }

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
            logger.warning(
                "Binance ticker unavailable for %s; falling back to Kraken: %s",
                symbol,
                binance_error,
            )

        ticker = await self._kraken_ticker(symbol)
        last_price = float(ticker["c"][0])
        open_price = float(ticker.get("o") or last_price)
        volume_data = ticker.get("v") or [0, 0]
        high_data = ticker.get("h") or [last_price, last_price]
        low_data = ticker.get("l") or [last_price, last_price]
        volume_24h = float(volume_data[1] if len(volume_data) > 1 else volume_data[0])
        change = last_price - open_price
        change_percent = (change / open_price * 100) if open_price else 0.0

        return {
            "symbol": symbol,
            "lastPrice": last_price,
            "priceChange": change,
            "priceChangePercent": change_percent,
            "volume": volume_24h,
            "quoteVolume": volume_24h * last_price,
            "highPrice": float(high_data[1] if len(high_data) > 1 else high_data[0]),
            "lowPrice": float(low_data[1] if len(low_data) > 1 else low_data[0]),
            "provider": "Kraken Spot",
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
        limit = max(50, min(int(limit), 1000))

        try:
            data = await self._get(
                "/api/v3/klines",
                {
                    "symbol": symbol,
                    "interval": interval,
                    "limit": min(limit, 500),
                },
            )
            candles = [{
                "timestamp": int(c[0]),
                "open": float(c[1]),
                "high": float(c[2]),
                "low": float(c[3]),
                "close": float(c[4]),
                "volume": float(c[5]),
            } for c in data]
            logger.info(
                "Market candles loaded from Binance: %s %s (%s)",
                symbol,
                interval,
                len(candles),
            )
            return candles
        except Exception as binance_error:
            logger.warning(
                "Binance klines unavailable for %s %s; falling back to Kraken: %s",
                symbol,
                interval,
                binance_error,
            )

        result = await self._kraken_get(
            "OHLC",
            {
                "pair": self._kraken_pair(symbol),
                "interval": KRAKEN_INTERVALS[interval],
            },
        )
        rows = self._kraken_result_value(result)
        if not rows:
            raise RuntimeError(f"Kraken returned no candles for {symbol} {interval}")

        candles = [{
            "timestamp": int(float(candle[0])) * 1000,
            "open": float(candle[1]),
            "high": float(candle[2]),
            "low": float(candle[3]),
            "close": float(candle[4]),
            "volume": float(candle[6]),
        } for candle in rows]
        candles.sort(key=lambda candle: candle["timestamp"])
        candles = candles[-limit:]
        logger.info(
            "Market candles loaded from Kraken Spot: %s %s (%s)",
            symbol,
            interval,
            len(candles),
        )
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
                ticker = await self._kraken_ticker("BTCUSDT")
                return bool(ticker)
            except Exception:
                return False


market_data = MarketData()


async def get_market_price(symbol: str) -> float:
    result = await market_data.get_price(symbol)
    return result["price"]
