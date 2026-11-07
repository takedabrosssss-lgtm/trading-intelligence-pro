import httpx
from datetime import datetime, timezone
from app.config import get_settings

CRYPTO = {"BTCUSDT", "ETHUSDT", "SOLUSDT"}
WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "EURUSD", "XAUUSD", "NAS100"]

class MarketDataError(RuntimeError):
    pass

class MarketData:
    def __init__(self):
        self.s = get_settings()

    async def candles(self, symbol: str, interval="1h", limit=1000):
        symbol = symbol.upper()
        if symbol in CRYPTO:
            url = f"{self.s.binance_base_url}/api/v3/klines"
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(url, params={
                    "symbol": symbol,
                    "interval": interval,
                    "limit": min(limit, 1000)
                })
                r.raise_for_status()
                raw = r.json()
            return [{
                "time": int(x[0]),
                "open": float(x[1]),
                "high": float(x[2]),
                "low": float(x[3]),
                "close": float(x[4]),
                "volume": float(x[5])
            } for x in raw]

        if not self.s.twelve_data_api_key:
            raise MarketDataError(
                f"{symbol}: set TWELVE_DATA_API_KEY and verify instrument availability."
            )

        td_symbol = {
            "EURUSD": "EUR/USD",
            "XAUUSD": "XAU/USD",
            "NAS100": "NDX"
        }.get(symbol)

        if not td_symbol:
            raise MarketDataError(f"Unsupported symbol: {symbol}")

        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                "https://api.twelvedata.com/time_series",
                params={
                    "symbol": td_symbol,
                    "interval": interval,
                    "outputsize": min(limit, 5000),
                    "apikey": self.s.twelve_data_api_key,
                    "format": "JSON"
                }
            )
            r.raise_for_status()
            data = r.json()

        if "values" not in data:
            raise MarketDataError(
                f"Provider error for {symbol}: {data.get('message', data)}"
            )

        rows = []
        for x in reversed(data["values"]):
            dt = datetime.fromisoformat(
                x["datetime"].replace("Z", "+00:00")
            )
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)

            rows.append({
                "time": int(dt.timestamp()),
                "open": float(x["open"]),
                "high": float(x["high"]),
                "low": float(x["low"]),
                "close": float(x["close"]),
                "volume": float(x.get("volume") or 0)
            })

        return rows

    async def quote(self, symbol):
        rows = await self.candles(symbol, "1h", 3)
        return rows[-1]["close"]
