
"""Authenticated read-only Intelligence endpoints.
Trade execution remains Paper Trading only.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import SessionLocal, PaperAccount, Position, Trade
from app.market_data import market_data
from app.intelligence import analyze_market, backtest
from app.strategy_lab import compare_strategies
from app.research_engine import research_strategies
from app.cross_asset_research import aggregate_cross_asset
from app.historical_research import (
    load_historical_candles,
    MAX_CANDLES,
)

logger = logging.getLogger(__name__)

CROSS_ASSET_SYMBOLS = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
]

VALID_INTERVALS = {"1h", "4h", "1d"}


def build_router(require_user):
    router = APIRouter(
        prefix="/api/intelligence",
        tags=["intelligence"],
    )

    @router.get("/overview")
    async def overview(user=Depends(require_user)):
        db = SessionLocal()

        try:
            accounts = (
                db.query(PaperAccount)
                .order_by(PaperAccount.id.asc())
                .all()
            )

            trades = (
                db.query(Trade)
                .order_by(Trade.id.desc())
                .limit(500)
                .all()
            )

            positions = (
                db.query(Position)
                .filter(Position.status == "open")
                .all()
            )

            pnl = [
                float(t.net_pnl or 0)
                for t in trades
            ]

            wins = [x for x in pnl if x > 0]
            losses = [x for x in pnl if x < 0]

            return {
                "mode": "paper_only",
                "accounts": [
                    {
                        "name": a.name,
                        "strategy": a.strategy,
                        "balance": round(
                            float(a.balance or 0), 2
                        ),
                        "active": bool(a.is_active),
                    }
                    for a in accounts
                ],
                "open_positions": len(positions),
                "closed_trades_sample": len(pnl),
                "win_rate_pct": (
                    round(100 * len(wins) / len(pnl), 2)
                    if pnl else None
                ),
                "profit_factor": (
                    round(sum(wins) / abs(sum(losses)), 3)
                    if losses
                    else ("inf" if wins else None)
                ),
                "net_pnl_sample": round(sum(pnl), 2),
                "learning_status": "collecting_outcomes",
                "learning_note": (
                    "Пока собираются результаты сделок. "
                    "Автоматическое изменение стратегий отключено."
                ),
            }

        finally:
            db.close()

    @router.get("/market/{symbol}")
    async def market_intelligence(
        symbol: str,
        interval: str = Query("1d"),
        user=Depends(require_user),
    ):
        symbol = symbol.upper()

        if (
            not symbol.endswith("USDT")
            or interval not in {"15m", "1h", "4h", "1d"}
        ):
            raise HTTPException(
                400,
                "Unsupported symbol or interval",
            )

        try:
            candles = await market_data.get_klines(
                symbol, interval, 300
            )

            return {
                "symbol": symbol,
                "interval": interval,
                **analyze_market(candles),
            }

        except Exception as exc:
            logger.exception("Market intelligence failed")
            raise HTTPException(
                502,
                "Market intelligence temporarily unavailable",
            ) from exc

    @router.get("/backtest/{symbol}")
    async def market_backtest(
        symbol: str,
        interval: str = Query("1d"),
        user=Depends(require_user),
    ):
        symbol = symbol.upper()

        if (
            not symbol.endswith("USDT")
            or interval not in VALID_INTERVALS
        ):
            raise HTTPException(
                400,
                "Unsupported symbol or interval",
            )

        try:
            candles = await market_data.get_klines(
                symbol, interval, 500
            )

            return {
                "symbol": symbol,
                "interval": interval,
                **backtest(candles),
            }

        except Exception as exc:
            logger.exception("Backtest failed")
            raise HTTPException(
                502,
                "Backtest data temporarily unavailable",
            ) from exc

    @router.get("/compare/{symbol}")
    async def compare_market_strategies(
        symbol: str,
        interval: str = Query("1d"),
        user=Depends(require_user),
    ):
        symbol = symbol.upper()

        if (
            not symbol.endswith("USDT")
            or interval not in VALID_INTERVALS
        ):
            raise HTTPException(
                400,
                "Unsupported symbol or interval",
            )

        try:
            candles = await market_data.get_klines(
                symbol, interval, 500
            )

            return {
                "symbol": symbol,
                "interval": interval,
                **compare_strategies(candles),
            }

        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

        except Exception as exc:
            logger.exception("Strategy comparison failed")
            raise HTTPException(
                502,
                "Strategy comparison data temporarily unavailable",
            ) from exc

    @router.get("/research/{symbol}")
    async def research_market_strategies(
        symbol: str,
        interval: str = Query("1d"),
        user=Depends(require_user),
    ):
        symbol = symbol.upper()

        if (
            not symbol.endswith("USDT")
            or interval not in VALID_INTERVALS
        ):
            raise HTTPException(
                400,
                "Unsupported symbol or interval",
            )

        try:
            candles = await market_data.get_klines(
                symbol, interval, 500
            )

            return {
                "symbol": symbol,
                "interval": interval,
                **research_strategies(candles),
            }

        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

        except Exception as exc:
            logger.exception("Walk-forward research failed")
            raise HTTPException(
                502,
                "Walk-forward research temporarily unavailable",
            ) from exc

    @router.get("/research-universe")
    async def research_universe(
        interval: str = Query("1d"),
        user=Depends(require_user),
    ):
        if interval not in VALID_INTERVALS:
            raise HTTPException(
                400,
                "Unsupported interval",
            )

        results = []

        # Sequential requests protect Render Free from burst traffic.
        for symbol in CROSS_ASSET_SYMBOLS:
            try:
                candles = await market_data.get_klines(
                    symbol, interval, 500
                )

                results.append({
                    "symbol": symbol,
                    **research_strategies(candles),
                })

            except Exception:
                logger.exception(
                    "Standard research failed for %s",
                    symbol,
                )

                results.append({
                    "symbol": symbol,
                    "status": "unavailable",
                    "families": [],
                })

        summary = aggregate_cross_asset(
            results,
            CROSS_ASSET_SYMBOLS,
        )

        return {
            "interval": interval,
            **summary,
        }

    # --------------------------------------------------
    # MIRAGE 2.5 — DEEP HISTORICAL RESEARCH
    # --------------------------------------------------

    @router.get("/research-history/{symbol}")
    async def research_history(
        symbol: str,
        interval: str = Query("1d"),
        limit: int = Query(
            1200,
            ge=240,
            le=MAX_CANDLES,
        ),
        user=Depends(require_user),
    ):
        symbol = symbol.upper()

        if not symbol.endswith("USDT"):
            raise HTTPException(
                400,
                "Unsupported symbol",
            )

        if interval not in VALID_INTERVALS:
            raise HTTPException(
                400,
                "Unsupported interval",
            )

        try:
            candles = await load_historical_candles(
                symbol,
                interval,
                limit,
            )

            result = research_strategies(candles)

            return {
                "symbol": symbol,
                "interval": interval,
                "history_source": "Binance Spot OHLCV",
                "requested_candles": limit,
                **result,
            }

        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

        except Exception as exc:
            logger.exception(
                "Historical research failed for %s",
                symbol,
            )

            raise HTTPException(
                502,
                "Historical research data temporarily unavailable",
            ) from exc

    @router.get("/research-universe-history")
    async def research_universe_history(
        interval: str = Query("1d"),
        limit: int = Query(
            1200,
            ge=240,
            le=MAX_CANDLES,
        ),
        user=Depends(require_user),
    ):
        if interval not in VALID_INTERVALS:
            raise HTTPException(
                400,
                "Unsupported interval",
            )

        results = []

        # Deliberately sequential: one asset at a time.
        # This reduces pressure on Binance and Render Free.
        for symbol in CROSS_ASSET_SYMBOLS:
            try:
                candles = await load_historical_candles(
                    symbol,
                    interval,
                    limit,
                )

                result = research_strategies(candles)

                results.append({
                    "symbol": symbol,
                    **result,
                })

            except Exception:
                logger.exception(
                    "Deep research failed for %s",
                    symbol,
                )

                results.append({
                    "symbol": symbol,
                    "status": "unavailable",
                    "families": [],
                })

        summary = aggregate_cross_asset(
            results,
            CROSS_ASSET_SYMBOLS,
        )

        return {
            "interval": interval,
            "requested_candles_per_asset": limit,
            "history_source": "Binance Spot OHLCV",
            **summary,
        }

    return router
        
