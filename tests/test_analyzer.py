
import math
import unittest

from app.analyzer import analyze_market


def make_candles(trend=1):
    candles = []

    for i in range(120):
        base = 100 + trend * i * 0.3 + math.sin(i / 4) * 1.5

        candles.append({
            "timestamp": 1700000000 + i * 900,
            "open": base - 0.2,
            "high": base + 0.8,
            "low": base - 0.8,
            "close": base,
            "volume": 1000 + i * 5,
        })

    return candles


class AnalyzerTests(unittest.TestCase):

    def test_analysis_returns_required_fields(self):
        result = analyze_market(make_candles())

        self.assertIsInstance(result, dict)

        for field in (
            "direction",
            "score",
            "grade",
            "entry_price",
            "indicators",
            "reasoning",
        ):
            self.assertIn(field, result)

    def test_score_is_within_valid_range(self):
        result = analyze_market(make_candles())

        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)

    def test_direction_is_valid(self):
        result = analyze_market(make_candles())

        self.assertIn(
            result["direction"],
            ("BUY", "SELL", "NEUTRAL"),
        )

    def test_analysis_is_deterministic(self):
        candles = make_candles()

        first = analyze_market(candles)
        second = analyze_market(candles)

        self.assertEqual(first["score"], second["score"])
        self.assertEqual(first["direction"], second["direction"])


if __name__ == "__main__":
    unittest.main()
    
