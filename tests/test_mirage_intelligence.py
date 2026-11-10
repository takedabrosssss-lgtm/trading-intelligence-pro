import unittest
from types import SimpleNamespace
from app.risk_engine import assess_position
from app.intelligence import analyze_market, backtest

class MirageTests(unittest.TestCase):
    def test_aggregate_risk_blocks_when_reserved(self):
        p=SimpleNamespace(entry_price=100,stop_loss=90,quantity=3,current_price=100,direction="BUY")
        d=assess_position(equity=1000,entry=100,stop=95,open_positions=[p],max_risk_fraction=.015,max_total_risk_fraction=.02,max_exposure_fraction=.9)
        self.assertFalse(d.allowed)
    def test_position_size(self):
        d=assess_position(equity=1000,entry=100,stop=95,open_positions=[],max_risk_fraction=.01,max_total_risk_fraction=.04,max_exposure_fraction=.9)
        self.assertTrue(d.allowed); self.assertAlmostEqual(d.quantity,2.0)
    def test_short_data(self):
        self.assertEqual(analyze_market([])["status"],"insufficient_data")
        self.assertEqual(backtest([])["status"],"insufficient_data")
    def test_backtest_holdout(self):
        candles=[]; price=100
        for i in range(240):
            price*=1.002 if i%70<45 else .999
            candles.append({"open":price*.999,"high":price*1.002,"low":price*.998,"close":price,"volume":100+i%9})
        result=backtest(candles)
        self.assertEqual(result["status"],"ok"); self.assertIn("out_of_sample",result)

if __name__=="__main__": unittest.main()
