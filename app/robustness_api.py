"""Authenticated, read-only MIRAGE 2.6 robustness endpoint."""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from app.historical_research import load_historical_candles, MAX_CANDLES, VALID_INTERVALS
from app.robustness_engine import run_robustness

logger = logging.getLogger(__name__)


def build_robustness_router(require_user):
    router = APIRouter(prefix="/api/intelligence", tags=["robustness"])

    @router.get("/robustness/{symbol}")
    async def robustness(symbol: str, interval: str = Query("1d"),
                         limit: int = Query(1200, ge=240, le=MAX_CANDLES),
                         user=Depends(require_user)):
        symbol = symbol.upper()
        if not symbol.endswith("USDT") or not symbol[:-4].isalnum():
            raise HTTPException(400, "Unsupported symbol")
        if interval not in VALID_INTERVALS:
            raise HTTPException(400, "Unsupported interval")
        try:
            candles = await load_historical_candles(symbol, interval, limit)
            result = await asyncio.to_thread(run_robustness, candles)
            return {"symbol": symbol, "interval": interval,
                    "history_source": "Binance Spot OHLCV", **result}
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            logger.exception("Robustness research failed for %s", symbol)
            raise HTTPException(502, "Robustness research temporarily unavailable") from exc

    return router
