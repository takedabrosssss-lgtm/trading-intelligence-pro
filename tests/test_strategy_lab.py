import unittest
from app.strategy_lab import compare_strategies, _simulate, STRATEGIES


def make_candles(closes):
    rows = []
    for i, close in enumerate(closes):
        previous = closes[i - 1] if i else close
        rows.append({
            "open": previous,
            "high": max(previous, close) * 1.002,
            "low": min(previous, close) * 0.998,
            "close": close,
            "volume": 100.0 + (i % 7),
        })
    return rows


class StrategyLabTests(unittest.TestCase):
    def test_insufficient_data_is_explicit(self):
        result = compare_strategies(make_candles([100 + i for i in range(100)]))
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["minimum_candles"], 150)

    def test_all_strategies_share_same_sample_and_return_metrics(self):
        closes = [100.0]
        for i in range(1, 520):
            phase = (i // 55) % 4
            factor = [1.0025, 0.9975, 1.0015, 0.9985][phase]
            closes.append(closes[-1] * factor)
        result = compare_strategies(make_candles(closes))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["candles"], 520)
        self.assertEqual(len(result["strategies"]), len(STRATEGIES))
        self.assertEqual({x["id"] for x in result["strategies"]}, set(STRATEGIES))
        self.assertEqual([x["out_of_sample_rank"] for x in result["strategies"]], [1, 2, 3, 4])
        for item in result["strategies"]:
            for segment in (item["in_sample"], item["out_of_sample"]):
                for key in ("return_pct", "max_drawdown_pct", "trades", "win_rate_pct", "profit_factor", "expectancy_pct", "fees_paid_pct_initial_equity"):
                    self.assertIn(key, segment)

    def test_invalid_costs_and_split_rejected(self):
        rows = make_candles([100 + i * 0.1 for i in range(200)])
        with self.assertRaises(ValueError):
            compare_strategies(rows, fee_rate=-0.01)
        with self.assertRaises(ValueError):
            compare_strategies(rows, slippage_rate=0.2)
        with self.assertRaises(ValueError):
            compare_strategies(rows, train_fraction=0.9)

    def test_costs_reduce_strategy_return(self):
        closes = [100.0]
        for i in range(1, 260):
            closes.append(closes[-1] * (1.003 if (i // 18) % 2 == 0 else 0.997))
        rows = make_candles(closes)
        free = _simulate(rows, "ema_trend", 50, len(rows), 0.0, 0.0)
        charged = _simulate(rows, "ema_trend", 50, len(rows), 0.001, 0.0005)
        self.assertGreaterEqual(free["return_pct"], charged["return_pct"])
        self.assertGreater(charged["fees_paid_pct_initial_equity"], 0.0)

    def test_out_of_sample_starts_flat(self):
        closes = [100.0]
        for i in range(1, 350):
            closes.append(closes[-1] * (1.002 if i < 240 else 0.998))
        rows = make_candles(closes)
        result = compare_strategies(rows)
        self.assertEqual(result["status"], "ok")
        # Each OOS curve is initialized at unit equity (within the first fill costs).
        for item in result["strategies"]:
            curve = item["out_of_sample"]["equity_curve"]
            if curve:
                self.assertLess(curve[0]["equity"], 1.01)
                self.assertGreater(curve[0]["equity"], 0.95)


if __name__ == "__main__":
    unittest.main()
