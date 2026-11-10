
import unittest
from unittest.mock import AsyncMock, patch

from app.historical_research import (
    load_historical_candles,
    _parse,
    PAGE_SIZE,
    MAX_CANDLES,
)


def make_candle(timestamp, close=100.0):
    return [
        timestamp,
        str(close),
        str(close + 2),
        str(close - 2),
        str(close),
        "1000",
        str(timestamp + 59999),
        "100000",
        10,
        "500",
        "50000",
        "0",
    ]


class HistoricalResearchTests(unittest.IsolatedAsyncioTestCase):

    def test_parse_binance_rows(self):
        rows = [
            make_candle(1000, 100),
            make_candle(2000, 105),
        ]

        result = _parse(rows)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["timestamp"], 1000)
        self.assertEqual(result[1]["close"], 105.0)
        self.assertEqual(result[0]["volume"], 1000.0)

    def test_parse_skips_invalid_rows(self):
        rows = [
            make_candle(1000),
            ["invalid"],
            None,
        ]

        result = _parse(rows)

        self.assertEqual(len(result), 1)

    async def test_rejects_invalid_symbol(self):
        with self.assertRaises(ValueError):
            await load_historical_candles(
                "BTCUSD",
                "1d",
                500,
            )

    async def test_rejects_invalid_interval(self):
        with self.assertRaises(ValueError):
            await load_historical_candles(
                "BTCUSDT",
                "5m",
                500,
            )

    async def test_limit_is_bounded(self):
        rows = [
            make_candle(i * 60000)
            for i in range(240)
        ]

        with patch(
            "app.historical_research.market_data._get",
            new=AsyncMock(return_value=rows),
        ) as mocked:

            result = await load_historical_candles(
                "BTCUSDT",
                "1d",
                100000,
            )

        self.assertLessEqual(len(result), MAX_CANDLES)
        self.assertEqual(mocked.call_count, 1)

    async def test_pagination_and_deduplication(self):
        first_page = [
            make_candle(i * 60000)
            for i in range(500, 1000)
        ]

        second_page = [
            make_candle(i * 60000)
            for i in range(200, 500)
        ]

        with patch(
            "app.historical_research.market_data._get",
            new=AsyncMock(
                side_effect=[first_page, second_page]
            ),
        ) as mocked:

            result = await load_historical_candles(
                "BTCUSDT",
                "1h",
                700,
            )

        timestamps = [
            candle["timestamp"]
            for candle in result
        ]

        self.assertEqual(len(result), 700)
        self.assertEqual(timestamps, sorted(set(timestamps)))
        self.assertEqual(mocked.call_count, 2)

    async def test_empty_response(self):
        with patch(
            "app.historical_research.market_data._get",
            new=AsyncMock(return_value=[]),
        ):
            result = await load_historical_candles(
                "BTCUSDT",
                "1d",
                500,
            )

        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
  
