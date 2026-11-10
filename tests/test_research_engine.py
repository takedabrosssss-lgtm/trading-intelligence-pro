import math
import time
import unittest
from app.research_engine import research_strategies, _clean, _ema_series, _rsi_series


def candles(n=1200):
    out=[]
    price=100.0
    for i in range(n):
        # Deterministic mixed trend/range path, no external data needed.
        change=0.0008*math.sin(i/17.0)+0.00025*math.cos(i/5.0)+0.00008
        price *= 1+change
        out.append({"open":price*0.999,"high":price*1.002,"low":price*0.998,"close":price,"volume":1000+i%37})
    return out


class ResearchEngineTests(unittest.TestCase):
    def test_ema_series_shape_and_seed(self):
        values=[1.,2.,3.,4.,5.]
        result=_ema_series(values,3)
        self.assertIsNone(result[1])
        self.assertEqual(result[2],2.0)
        self.assertAlmostEqual(result[3],3.0)

    def test_rsi_series_has_valid_values(self):
        values=[float(x) for x in range(1,40)]
        result=_rsi_series(values,14)
        self.assertIsNone(result[13])
        self.assertEqual(result[14],100.0)
        self.assertTrue(all(0 <= x <= 100 for x in result[14:] if x is not None))

    def test_1200_candle_research_returns_contract(self):
        result=research_strategies(candles())
        self.assertEqual(result["status"],"ok")
        self.assertEqual(result["candles"],1200)
        self.assertEqual(len(result["families"]),4)
        for family in result["families"]:
            self.assertIn("out_of_sample_return_pct",family)
            self.assertEqual(len(family["folds"]),3)

    def test_invalid_candles_are_skipped(self):
        data=candles(250)+[{"open":float('nan'),"high":1,"low":1,"close":1,"volume":1}]
        self.assertEqual(len(_clean(data)),250)

    def test_insufficient_data_contract(self):
        result=research_strategies(candles(100))
        self.assertEqual(result["status"],"insufficient_data")
        self.assertEqual(result["families"],[])


if __name__ == '__main__':
    unittest.main()
