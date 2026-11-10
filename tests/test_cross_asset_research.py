import unittest
from app.cross_asset_research import aggregate_cross_asset


class CrossAssetResearchTests(unittest.TestCase):
    def sample(self):
        return [
            {"symbol": "BTCUSDT", "status": "ok", "families": [
                {"id": "donchian", "name": "Donchian", "out_of_sample_return_pct": 12, "max_fold_drawdown_pct": 8, "validation_trades": 20, "positive_folds": 2, "parameter_stability": "varied", "profit_factor": 1.4},
                {"id": "ema", "name": "EMA", "out_of_sample_return_pct": -3, "max_fold_drawdown_pct": 9, "validation_trades": 10, "profit_factor": 0.8},]},
            {"symbol": "ETHUSDT", "status": "ok", "families": [
                {"id": "donchian", "name": "Donchian", "out_of_sample_return_pct": 5, "max_fold_drawdown_pct": 7, "validation_trades": 25, "positive_folds": 2, "parameter_stability": "stable", "profit_factor": 1.2},
                {"id": "ema", "name": "EMA", "out_of_sample_return_pct": -2, "max_fold_drawdown_pct": 8, "validation_trades": 11, "profit_factor": 0.9},]},
            {"symbol": "SOLUSDT", "status": "ok", "families": [
                {"id": "donchian", "name": "Donchian", "out_of_sample_return_pct": -1, "max_fold_drawdown_pct": 12, "validation_trades": 18, "positive_folds": 1, "parameter_stability": "varied", "profit_factor": 0.95},
                {"id": "ema", "name": "EMA", "out_of_sample_return_pct": -5, "max_fold_drawdown_pct": 10, "validation_trades": 8, "profit_factor": 0.7},]},
        ]

    def test_requires_three_assets(self):
        result = aggregate_cross_asset(self.sample()[:2], ["BTCUSDT", "ETHUSDT", "SOLUSDT"])
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["assets_available"], 2)

    def test_median_and_positive_asset_count(self):
        result = aggregate_cross_asset(self.sample(), ["BTCUSDT", "ETHUSDT", "SOLUSDT"])
        self.assertEqual(result["status"], "ok")
        top = result["families"][0]
        self.assertEqual(top["id"], "donchian")
        self.assertEqual(top["positive_assets"], 2)
        self.assertEqual(top["median_oos_return_pct"], 5)
        self.assertEqual(top["total_validation_trades"], 63)
        self.assertEqual(top["research_status"], "not_validated")

    def test_failed_assets_are_reported(self):
        rows = self.sample() + [{"symbol": "BNBUSDT", "status": "unavailable", "families": []}]
        result = aggregate_cross_asset(rows, ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"])
        self.assertEqual(result["failed_symbols"], ["BNBUSDT"])


if __name__ == "__main__":
    unittest.main()
