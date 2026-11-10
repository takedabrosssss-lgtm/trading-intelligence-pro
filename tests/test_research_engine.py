import unittest
from app.research_engine import research_strategies, _simulate, CANDIDATES


def candles_from(closes):
    result = []
    for i, close in enumerate(closes):
        prev = closes[i - 1] if i else close
        result.append({"open": prev, "high": max(prev, close) * 1.002,
                       "low": min(prev, close) * 0.998, "close": close,
                       "volume": 100 + i % 11})
    return result


class ResearchEngineTests(unittest.TestCase):
    def make_series(self, n=500):
        closes = [100.0]
        for i in range(1, n):
            phase = (i // 60) % 4
            rate = [0.0025, -0.0022, 0.0018, -0.0016][phase]
            closes.append(closes[-1] * (1 + rate))
        return candles_from(closes)

    def test_insufficient_data(self):
        result = research_strategies(self.make_series(200))
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["minimum_candles"], 240)

    def test_three_walk_forward_folds_for_each_family(self):
        result = research_strategies(self.make_series())
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["folds"], 3)
        self.assertEqual(len(result["families"]), len(CANDIDATES))
        for family in result["families"]:
            self.assertEqual(len(family["folds"]), 3)
            self.assertIn(family["research_status"], {"promising_but_unconfirmed", "not_validated"})
            self.assertTrue(all(f["validation_candles"] > 0 for f in family["folds"]))

    def test_invalid_costs_rejected(self):
        with self.assertRaises(ValueError):
            research_strategies(self.make_series(), fee_rate=-0.1)

    def test_costs_reduce_return(self):
        rows = self.make_series(300)
        params = CANDIDATES["ema_trend"][0]
        free = _simulate(rows, "ema_trend", params, 50, len(rows), 0, 0)
        charged = _simulate(rows, "ema_trend", params, 50, len(rows), 0.001, 0.0005)
        self.assertLessEqual(charged["return_pct"], free["return_pct"])

    def test_regime_is_descriptive(self):
        result = research_strategies(self.make_series())
        self.assertIn(result["regime"]["label"], {"trend", "range", "high_volatility"})
        self.assertIn("not used", result["regime"]["note"])


if __name__ == "__main__":
    unittest.main()
