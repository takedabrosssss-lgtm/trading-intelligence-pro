import asyncio
from app.market_data import MarketData


def test_generic_klines_uses_futures_not_spot():
    client = MarketData()
    calls = []

    async def futures_get(path, params):
        calls.append((path, params))
        return [[1, "100", "110", "90", "105", "12", 2]]

    async def spot_get(*args, **kwargs):
        raise AssertionError("Spot endpoint must not be used for strategy candles")

    client._futures_get = futures_get
    client._get = spot_get
    rows = asyncio.run(client.get_klines("BTCUSDT", "1h", 200))
    assert calls[0][0] == "/fapi/v1/klines"
    assert rows[0]["close"] == 105.0
    assert rows[0]["volume"] == 12.0


def test_mark_price_and_funding_are_parsed():
    client = MarketData()
    async def futures_get(path, params):
        if path == "/fapi/v1/premiumIndex":
            return {"symbol": "BTCUSDT", "markPrice": "101.25", "indexPrice": "101", "lastFundingRate": "0.0001", "nextFundingTime": 1700000000000}
        if path == "/fapi/v1/fundingRate":
            return [{"symbol": "BTCUSDT", "fundingRate": "0.001", "fundingTime": 1700000000000, "markPrice": "101.25"}]
        raise AssertionError(path)
    client._futures_get = futures_get
    quote = asyncio.run(client.get_mark_price("BTCUSDT"))
    rates = asyncio.run(client.get_funding_rates("BTCUSDT", 1, 2))
    assert quote["mark_price"] == 101.25
    assert rates[0]["funding_rate"] == 0.001
    assert rates[0]["mark_price"] == 101.25


def test_futures_error_does_not_fall_back_to_spot():
    client = MarketData()
    async def fail(*args, **kwargs):
        raise RuntimeError("fapi blocked")
    async def spot(*args, **kwargs):
        raise AssertionError("No Spot fallback for Futures")
    client._futures_get = fail
    client._get = spot
    try:
        asyncio.run(client.get_price("BTCUSDT"))
    except RuntimeError as exc:
        assert "fapi blocked" in str(exc)
    else:
        raise AssertionError("Expected explicit Futures API failure")
