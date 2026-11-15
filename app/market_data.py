"""Market data adapters for MIRAGE.

New signal generation and Futures Paper Trading use Binance USD-M Futures only.
Legacy Spot positions retain an explicit Spot quote path and never fall back from
Futures to Spot prices.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SPOT_BASE_URL = getattr(settings, "binance_base_url", "https://data-api.binance.vision").rstrip("/")
FUTURES_BASE_URL = getattr(settings, "binance_futures_base_url", "https://fapi.binance.com").rstrip("/")
KRAKEN_BASE_URL = "https://api.kraken.com"

ALLOWED_INTERVALS = {
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M",
}

KRAKEN_INTERVALS = {
    "1m": 1, "5m": 5, "15m": 15, "30m": 30,
    "1h": 60, "4h": 240, "1d": 1440, "1w": 10080,
}
KRAKEN_PAIRS = {"BTCUSDT": "XBTUSDT", "DOGEUSDT": "XDGUSDT", "BNBUSDT": "BNBUSD"}


class MarketData:
    def __init__(self) -> None:
        self.timeout = float(getattr(settings, "request_timeout_seconds", 15))
        self.headers = {
            "Accept": "application/json",
            "User-Agent": "TradingIntelligencePRO/2.0",
        }

    async def _request_json(self, base_url: str, endpoint: str, params: dict | None = None) -> Any:
        url = f"{base_url}{endpoint}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, params=params, headers=self.headers)
                response.raise_for_status()
                data = response.json()
            if isinstance(data, dict) and data.get("code") not in (None, 0, "0"):
                raise RuntimeError(f"Exchange API error: {str(data.get('msg', 'unknown'))[:200]}")
            return data
        except httpx.TimeoutException as exc:
            logger.warning("Market data timed out endpoint=%s", endpoint)
            raise RuntimeError("Market data request timed out") from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("Market data HTTP error endpoint=%s status=%s", endpoint, exc.response.status_code)
            raise RuntimeError(f"Market data HTTP {exc.response.status_code}") from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.warning("Market data request failed endpoint=%s error=%s", endpoint, type(exc).__name__)
            raise RuntimeError("Invalid market data response") from exc

    async def _get(self, endpoint: str, params: dict | None = None) -> Any:
        """Legacy Binance Spot request helper; used only for old Spot records."""
        return await self._request_json(SPOT_BASE_URL, endpoint, params)

    async def _futures_get(self, endpoint: str, params: dict | None = None) -> Any:
        """Binance USD-M Futures public REST request. No Spot fallback by design."""
        return await self._request_json(FUTURES_BASE_URL, endpoint, params)

    def _kraken_pair(self, symbol: str) -> str:
        return KRAKEN_PAIRS.get(symbol.upper(), symbol.upper())

    async def _kraken_get(self, endpoint: str, params: dict | None = None) -> dict:
        url = f"{KRAKEN_BASE_URL}/0/public/{endpoint}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(url, params=params, headers=self.headers)
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

    async def get_price(self, symbol: str) -> dict:
        """Last traded price for a USD-M perpetual contract; never Spot."""
        symbol = symbol.upper()
        data = await self._futures_get("/fapi/v1/ticker/price", {"symbol": symbol})
        price = float(data.get("price") or 0)
        if price <= 0:
            raise RuntimeError(f"Futures returned invalid last price for {symbol}")
        return {"symbol": symbol, "price": price, "provider": "Binance USD-M Futures Last Price", "market_type": "usdt_perpetual_futures"}

    async def get_mark_price(self, symbol: str) -> dict:
        """Mark price used for Futures stop checks and liquidation monitoring."""
        symbol = symbol.upper()
        data = await self._futures_get("/fapi/v1/premiumIndex", {"symbol": symbol})
        price = float(data.get("markPrice") or 0)
        if price <= 0:
            raise RuntimeError(f"Futures returned invalid mark price for {symbol}")
        return {
            "symbol": symbol,
            "price": price,
            "mark_price": price,
            "index_price": float(data.get("indexPrice") or 0),
            "last_funding_rate": float(data.get("lastFundingRate") or 0),
            "next_funding_time": int(data.get("nextFundingTime") or 0),
            "provider": "Binance USD-M Futures Mark Price",
            "market_type": "usdt_perpetual_futures",
        }

    async def get_24h_ticker(self, symbol: str) -> dict:
        symbol = symbol.upper()
        data = await self._futures_get("/fapi/v1/ticker/24hr", {"symbol": symbol})
        return {
            "symbol": data["symbol"],
            "lastPrice": float(data["lastPrice"]),
            "priceChange": float(data["priceChange"]),
            "priceChangePercent": float(data["priceChangePercent"]),
            "volume": float(data["volume"]),
            "quoteVolume": float(data["quoteVolume"]),
            "highPrice": float(data["highPrice"]),
            "lowPrice": float(data["lowPrice"]),
            "provider": "Binance USD-M Futures",
            "market_type": "usdt_perpetual_futures",
        }

    def _parse_klines(self, rows: list) -> list[dict]:
        candles = []
        for row in rows:
            try:
                candles.append({
                    "timestamp": int(row[0]),
                    "open": float(row[1]),
                    "high": float(row[2]),
                    "low": float(row[3]),
                    "close": float(row[4]),
                    "volume": float(row[5]),
                    "close_time": int(row[6]) if len(row) > 6 else None,
                })
            except (IndexError, TypeError, ValueError):
                continue
        return candles

    async def get_klines(self, symbol: str, interval: str = "1h", limit: int = 200) -> list[dict]:
        """USD-M Futures contract OHLCV, used for strategy and signal generation."""
        symbol = symbol.upper()
        if interval not in ALLOWED_INTERVALS:
            raise ValueError("Unsupported candle interval")
        limit = max(50, min(int(limit), 1500))
        rows = await self._futures_get("/fapi/v1/klines", {
            "symbol": symbol, "interval": interval, "limit": limit,
        })
        candles = self._parse_klines(rows)
        if not candles:
            raise RuntimeError(f"Binance USD-M Futures returned no candles for {symbol} {interval}")
        logger.info("Futures candles loaded: %s %s (%s)", symbol, interval, len(candles))
        return candles

    async def get_mark_price_klines(self, symbol: str, interval: str = "1m", limit: int = 3, start_time: int | None = None, end_time: int | None = None) -> list[dict]:
        """Mark-price candles for stop/TP/liquidation touch evaluation."""
        symbol = symbol.upper()
        if interval not in ALLOWED_INTERVALS:
            raise ValueError("Unsupported mark-price candle interval")
        limit = max(1, min(int(limit), 1500))
        params = {"symbol": symbol, "interval": interval, "limit": limit}
        if start_time is not None:
            params["startTime"] = int(start_time)
        if end_time is not None:
            params["endTime"] = int(end_time)
        rows = await self._futures_get("/fapi/v1/markPriceKlines", params)
        candles = self._parse_klines(rows)
        if not candles:
            raise RuntimeError(f"Binance USD-M Futures returned no mark candles for {symbol}")
        return candles

    async def get_funding_rates(self, symbol: str, start_time: int, end_time: int, limit: int = 1000) -> list[dict]:
        symbol = symbol.upper()
        rows = await self._futures_get("/fapi/v1/fundingRate", {
            "symbol": symbol,
            "startTime": int(start_time),
            "endTime": int(end_time),
            "limit": max(1, min(int(limit), 1000)),
        })
        result = []
        for row in rows or []:
            try:
                result.append({
                    "symbol": row["symbol"],
                    "funding_rate": float(row["fundingRate"]),
                    "funding_time": int(row["fundingTime"]),
                    "mark_price": float(row["markPrice"]),
                })
            except (KeyError, TypeError, ValueError):
                continue
        return sorted(result, key=lambda x: x["funding_time"])

    # ----- Explicitly legacy Spot methods: only old Spot positions may call these. -----
    async def get_spot_price(self, symbol: str) -> dict:
        symbol = symbol.upper()
        try:
            data = await self._get("/api/v3/ticker/price", {"symbol": symbol})
            return {"symbol": symbol, "price": float(data["price"]), "provider": "Binance Spot Legacy", "market_type": "spot"}
        except Exception as binance_error:
            logger.warning("Legacy Spot quote unavailable for %s; Kraken fallback: %s", symbol, type(binance_error).__name__)
        ticker_data = await self._kraken_get("Ticker", {"pair": self._kraken_pair(symbol)})
        ticker = self._kraken_result_value(ticker_data)
        if not isinstance(ticker, dict) or "c" not in ticker:
            raise RuntimeError(f"Kraken returned no Spot ticker for {symbol}")
        return {"symbol": symbol, "price": float(ticker["c"][0]), "provider": "Kraken Spot Legacy", "market_type": "spot"}

    async def get_spot_klines(self, symbol: str, interval: str = "1h", limit: int = 200) -> list[dict]:
        symbol = symbol.upper()
        if interval not in {"1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"}:
            raise ValueError("Unsupported Spot candle interval")
        rows = await self._get("/api/v3/klines", {
            "symbol": symbol, "interval": interval, "limit": max(50, min(int(limit), 1000)),
        })
        candles = self._parse_klines(rows)
        if not candles:
            raise RuntimeError(f"No legacy Spot candles for {symbol}")
        return candles

    async def get_multiple_prices(self, symbols: list[str]) -> list[dict]:
        results = []
        for symbol in symbols:
            try:
                results.append(await self.get_price(symbol))
            except Exception as exc:
                logger.warning("Unable to load Futures price %s: %s", symbol, type(exc).__name__)
        return results

    async def health_check(self) -> bool:
        try:
            quote = await self.get_mark_price("BTCUSDT")
            return bool(quote.get("price", 0) > 0)
        except Exception:
            return False


market_data = MarketData()


async def get_market_price(symbol: str) -> float:
    result = await market_data.get_price(symbol)
    return result["price"]
