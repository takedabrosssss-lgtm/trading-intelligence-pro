import unittest
from app.intelligence import backtest, _simulate_segment


def candles_from_closes(closes):
    rows = []
    for i, close in enumerate(closes):
        previous = closes[i - 1] if i else close
        rows.append({
            "open": previous,
            "high": max(previous, close) * 1.001,
            "low": min(previous, close) * 0.999,
            "close": close,
            "volume": 100.0,
        })
    return rows


class BacktestAccountingTests(unittest.TestCase):
    def test_insufficient_data(self):
        self.assertEqual(backtest([])["status"], "insufficient_data")

    def test_invalid_cost_parameters_rejected(self):
        rows = candles_from_closes([100 + i for i in range(120)])
        with self.assertRaises(ValueError):
            backtest(rows, fee_rate=-0.001)
        with self.assertRaises(ValueError):
            backtest(rows, slippage_rate=0.2)

    def test_entry_fee_charged_once(self):
        # Rising history creates a bullish EMA spread; a flat segment keeps
        # the position open until final liquidation. Two sides cost ~0.1999%.
        closes = [100.0 + i * 0.5 for i in range(50)] + [124.5] * 90
        rows = candles_from_closes(closes)
        result = _simulate_segment(rows, start=50, end=len(rows), fee_rate=0.001, slippage_rate=0.0)
        self.assertEqual(result["trades"], 1)
        self.assertAlmostEqual(result["return_pct"], -0.1999, places=3)

    def test_equity_curve_marks_unrealized_drawdown(self):
        # A rising regime followed by a sharp fall creates an intra-position
        # equity drawdown before any EMA reversal can close the trade.
        closes = [100.0 + i * 0.8 for i in range(100)] + [179.2 - i * 2.0 for i in range(40)]
        result = _simulate_segment(candles_from_closes(closes), start=50, end=len(closes), fee_rate=0.0, slippage_rate=0.0)
        self.assertGreater(result["max_drawdown_pct"], 0.0)
        self.assertGreater(len(result["equity_curve"]), 0)

    def test_fees_and_slippage_are_counted_per_fill(self):
        closes = [100.0 + i * 0.4 for i in range(80)] + [132.0 - i * 0.5 for i in range(70)]
        rows = candles_from_closes(closes)
        free = _simulate_segment(rows, start=50, end=len(rows), fee_rate=0.0, slippage_rate=0.0)
        charged = _simulate_segment(rows, start=50, end=len(rows), fee_rate=0.001, slippage_rate=0.0005)
        self.assertGreater(free["return_pct"], charged["return_pct"])
        self.assertGreater(charged["fees_paid_pct_initial_equity"], 0.0)

    def test_holdout_is_separate_and_response_compatible(self):
        closes = [100.0]
        for i in range(1, 260):
            closes.append(closes[-1] * (1.002 if (i // 35) % 2 == 0 else 0.998))
        result = backtest(candles_from_closes(closes))
        self.assertEqual(result["status"], "ok")
        self.assertIn("in_sample", result)
        self.assertIn("out_of_sample", result)
        for section in (result["in_sample"], result["out_of_sample"]):
            for key in ("return_pct", "max_drawdown_pct", "trades", "win_rate_pct", "profit_factor", "expectancy_pct", "equity_curve"):
                self.assertIn(key, section)


if __name__ == "__main__":
    unittest.main()
