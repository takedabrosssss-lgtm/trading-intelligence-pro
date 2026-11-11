"""MIRAGE 4.0 read-only intelligence endpoints.

All endpoints are authenticated with the existing Telegram initData dependency.
This module is additive: it does not modify trading tables or execute orders.
"""
import asyncio
import logging
import math
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from app.config import settings

from app.database import SessionLocal, PaperAccount, Position, Signal, Trade, engine
from app.market_data import market_data

logger = logging.getLogger("mirage4.api")
VALID_INTERVALS = {"15m", "1h", "4h", "1d"}
VALID_DIRECTIONS = {"BUY", "SELL"}
VALID_SIGNAL_STATUSES = {"new", "sent", "filtered", "eligible", "paper_opened", "paper_closed", "paper_skipped"}


def _iso(value):
    return value.isoformat() if value else None


def _trade_dict(t):
    return {
        "id": t.id,
        "account_id": t.account_id,
        "position_id": t.position_id,
        "symbol": t.symbol,
        "direction": t.direction,
        "strategy": t.strategy,
        "entry_price": float(t.entry_price) if t.entry_price is not None else None,
        "exit_price": float(t.exit_price) if t.exit_price is not None else None,
        "quantity": float(t.quantity or 0),
        "gross_pnl": float(t.gross_pnl or 0),
        "fees": float(t.fees or 0),
        "net_pnl": float(t.net_pnl or 0),
        "exit_reason": t.exit_reason,
        "created_at": _iso(t.created_at),
        "closed_at": _iso(t.closed_at),
    }


def _signal_dict(s):
    return {
        "id": s.id,
        "symbol": s.symbol,
        "market": s.market,
        "timeframe": s.timeframe,
        "direction": s.direction,
        "grade": s.grade,
        "score": float(s.score) if s.score is not None else None,
        "confidence": float(s.confidence) if s.confidence is not None else None,
        "entry_price": float(s.entry_price) if s.entry_price is not None else None,
        "stop_loss": float(s.stop_loss) if s.stop_loss is not None else None,
        "take_profit": float(s.take_profit) if s.take_profit is not None else None,
        "strategy": s.strategy,
        "reasoning": s.reasoning,
        "indicators": s.indicators or {},
        "status": s.status,
        "created_at": _iso(s.created_at),
    }


def _safe_pf(wins, losses):
    if losses:
        return round(wins / losses, 3)
    return "inf" if wins > 0 else None


def build_mirage4_router(require_user, app, app_started_at):
    router = APIRouter(prefix="/api/mirage", tags=["mirage-4"])

    @router.get("/journal")
    async def journal(
        page: int = Query(1, ge=1, le=100000),
        limit: int = Query(25, ge=10, le=100),
        symbol: str = Query("", max_length=20),
        strategy: str = Query("", max_length=50),
        direction: str = Query("", max_length=4),
        result: str = Query("", pattern="^(|win|loss)$"),
        user=Depends(require_user),
    ):
        db = SessionLocal()
        try:
            # The journal is a closed-execution ledger. Open positions remain in
            # the portfolio endpoint and must not appear as completed trades.
            query = db.query(Trade).filter(Trade.closed_at.isnot(None))
            if symbol:
                sym = symbol.upper()
                if not sym.endswith("USDT") or not sym[:-4].isalnum():
                    raise HTTPException(400, "Invalid symbol filter")
                query = query.filter(Trade.symbol == sym)
            if strategy:
                query = query.filter(Trade.strategy == strategy)
            if direction:
                direction = direction.upper()
                if direction not in VALID_DIRECTIONS:
                    raise HTTPException(400, "Invalid direction filter")
                query = query.filter(Trade.direction == direction)
            if result not in {"", "win", "loss"}:
                raise HTTPException(400, "Invalid result filter")
            if result == "win":
                query = query.filter(Trade.net_pnl > 0)
            elif result == "loss":
                query = query.filter(Trade.net_pnl < 0)

            total = query.count()
            rows = (
                query.order_by(Trade.closed_at.desc(), Trade.id.desc())
                .offset((page - 1) * limit).limit(limit).all()
            )
            stats_rows = query.with_entities(
                func.count(Trade.id),
                func.sum(Trade.net_pnl),
                func.sum(Trade.gross_pnl),
                func.sum(Trade.fees),
            ).first()
            count = int(stats_rows[0] or 0)
            net = float(stats_rows[1] or 0)
            gross = float(stats_rows[2] or 0)
            fees = float(stats_rows[3] or 0)
            wins_count = query.filter(Trade.net_pnl > 0).count()
            # Keep Profit Factor in the exact same filtered population as the
            # rows and the other summary values shown on this journal page.
            wins = float(
                query.filter(Trade.net_pnl > 0)
                .with_entities(func.sum(Trade.net_pnl)).scalar() or 0
            )
            losses = abs(float(
                query.filter(Trade.net_pnl < 0)
                .with_entities(func.sum(Trade.net_pnl)).scalar() or 0
            ))
            return {
                "page": page, "limit": limit, "total": total,
                "pages": math.ceil(total / limit) if total else 0,
                "trades": [_trade_dict(t) for t in rows],
                "summary": {
                    "count": count, "wins": wins_count,
                    "win_rate_pct": round(wins_count / count * 100, 2) if count else None,
                    "net_pnl": round(net, 2), "gross_pnl": round(gross, 2),
                    "fees": round(fees, 2), "profit_factor": _safe_pf(wins, losses),
                },
            }
        finally:
            db.close()

    @router.get("/signals")
    async def signals(
        page: int = Query(1, ge=1, le=100000),
        limit: int = Query(20, ge=10, le=100),
        symbol: str = Query("", max_length=20),
        status: str = Query("", max_length=20),
        direction: str = Query("", max_length=4),
        timeframe: str = Query("", max_length=5),
        user=Depends(require_user),
    ):
        db = SessionLocal()
        try:
            query = db.query(Signal)
            if symbol:
                sym = symbol.upper()
                if not sym.endswith("USDT") or not sym[:-4].isalnum():
                    raise HTTPException(400, "Invalid symbol filter")
                query = query.filter(Signal.symbol == sym)
            if status:
                if status not in VALID_SIGNAL_STATUSES:
                    raise HTTPException(400, "Invalid signal status")
                query = query.filter(Signal.status == status)
            if direction:
                direction = direction.upper()
                if direction not in VALID_DIRECTIONS:
                    raise HTTPException(400, "Invalid signal direction")
                query = query.filter(Signal.direction == direction)
            if timeframe:
                if timeframe not in VALID_INTERVALS:
                    raise HTTPException(400, "Invalid timeframe")
                query = query.filter(Signal.timeframe == timeframe)
            total = query.count()
            rows = query.order_by(Signal.created_at.desc(), Signal.id.desc()).offset(
                (page - 1) * limit
            ).limit(limit).all()
            return {
                "page": page, "limit": limit, "total": total,
                "pages": math.ceil(total / limit) if total else 0,
                "signals": [_signal_dict(s) for s in rows],
            }
        finally:
            db.close()

    @router.get("/command-center")
    async def command_center(user=Depends(require_user)):
        db = SessionLocal()
        try:
            accounts = db.query(PaperAccount).order_by(PaperAccount.id.asc()).all()
            positions = db.query(Position).filter(Position.status == "open").all()
            closed_trades = (
                db.query(Trade)
                .filter(Trade.closed_at.isnot(None))
                .order_by(Trade.closed_at.asc(), Trade.id.asc())
                .all()
            )
            closed_count = len(closed_trades)
            wins = sum(float(t.net_pnl or 0) for t in closed_trades if float(t.net_pnl or 0) > 0)
            losses = abs(sum(float(t.net_pnl or 0) for t in closed_trades if float(t.net_pnl or 0) < 0))
            win_count = sum(1 for t in closed_trades if float(t.net_pnl or 0) > 0)
            net_pnl = sum(float(t.net_pnl or 0) for t in closed_trades)
            total_balance = sum(float(a.balance or 0) for a in accounts)
            initial = sum(float(a.initial_balance or 0) for a in accounts)
            unrealized = sum(float(p.unrealized_pnl or 0) for p in positions)
            equity = total_balance + unrealized

            # Closed-trade equity curve + current mark-to-market point. This is
            # a closed-bar/closed-trade drawdown measure, not intratrade MAE.
            curve_equity = initial
            curve_peak = initial
            max_closed_drawdown = 0.0
            for trade in closed_trades:
                curve_equity += float(trade.net_pnl or 0)
                curve_peak = max(curve_peak, curve_equity)
                if curve_peak > 0:
                    max_closed_drawdown = max(
                        max_closed_drawdown,
                        (curve_peak - curve_equity) / curve_peak * 100,
                    )
            current_peak = max(curve_peak, equity)
            current_drawdown = (
                max(0.0, (current_peak - equity) / current_peak * 100)
                if current_peak > 0 else 0.0
            )
            signal_count = db.query(Signal).count()
            latest_signal = db.query(Signal).order_by(Signal.created_at.desc()).first()
            # A deterministic data/track-record maturity score, never a
            # probability or a trade recommendation. Insufficient history earns
            # no track-record points instead of being treated as a good result.
            score = 20
            factors = [{"label": "База данных доступна", "points": 20, "state": "ok"}]
            if closed_count >= 30:
                score += 25
                factors.append({"label": "Достаточная выборка (≥ 30 сделок)", "points": 25, "state": "ok"})
            else:
                factors.append({"label": "Достаточная выборка (≥ 30 сделок)", "points": 0, "state": "insufficient"})
            pf_above_one = bool(wins > 0 and (not losses or wins / losses > 1))
            if closed_count >= 30 and pf_above_one:
                score += 20
                factors.append({"label": "Profit Factor > 1 на выборке ≥ 30", "points": 20, "state": "ok"})
            else:
                factors.append({"label": "Profit Factor > 1 на выборке ≥ 30", "points": 0, "state": "not_confirmed"})
            if closed_count >= 30 and max_closed_drawdown <= 5:
                score += 15
                factors.append({"label": "Максимальная закрытая просадка ≤ 5%", "points": 15, "state": "ok"})
            else:
                factors.append({"label": "Максимальная закрытая просадка ≤ 5%", "points": 0, "state": "insufficient_or_warning"})
            if signal_count:
                score += 10
                factors.append({"label": "Сигнальная история присутствует", "points": 10, "state": "ok"})
            else:
                factors.append({"label": "Сигнальная история присутствует", "points": 0, "state": "empty"})
            if closed_count >= 100:
                score += 10
                factors.append({"label": "Расширенная выборка (≥ 100 сделок)", "points": 10, "state": "ok"})
            else:
                factors.append({"label": "Расширенная выборка (≥ 100 сделок)", "points": 0, "state": "insufficient"})
            return {
                "mode": "paper_only",
                "score": min(100, score),
                "score_label": "Операционная зрелость данных",
                "score_is_probability": False,
                "score_factors": factors,
                "portfolio": {
                    "initial_capital": round(initial, 2),
                    "balance": round(total_balance, 2),
                    "equity": round(equity, 2),
                    "unrealized_pnl": round(unrealized, 2),
                    "net_realized_pnl": round(net_pnl, 2),
                    "current_drawdown_pct": round(current_drawdown, 2),
                    "max_closed_drawdown_pct": round(max_closed_drawdown, 2),
                    "return_pct": round((equity - initial) / initial * 100, 2) if initial else 0.0,
                    "open_positions": len(positions),
                    "accounts": len(accounts),
                },
                "trading": {
                    "closed_trades": closed_count,
                    "win_rate_pct": round(win_count / closed_count * 100, 2) if closed_count else None,
                    "profit_factor": _safe_pf(wins, losses),
                    "signals_total": signal_count,
                    "latest_signal_at": _iso(latest_signal.created_at) if latest_signal else None,
                },
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            db.close()

    @router.get("/health")
    async def system_health(user=Depends(require_user)):
        checks = {}
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            checks["database"] = {"status": "ok", "detail": "SELECT 1"}
        except Exception as exc:
            logger.exception("MIRAGE health database check failed")
            checks["database"] = {"status": "error", "detail": type(exc).__name__}

        try:
            market = await asyncio.wait_for(market_data.get_price("BTCUSDT"), timeout=6)
            checks["market_data"] = {
                "status": "ok", "provider": market.get("provider", "available"),
                "symbol": market.get("symbol"), "price": market.get("price"),
            }
        except Exception as exc:
            checks["market_data"] = {"status": "error", "detail": type(exc).__name__}

        worker = getattr(app.state, "worker_task", None)
        bot = getattr(app.state, "bot_task", None)
        checks["scanner"] = {
            "status": "running" if worker and not worker.done() else "not_running",
            "detail": "Фоновая задача сканера активна" if worker and not worker.done()
                      else "Задача сканера не запущена или завершилась",
        }
        checks["telegram_bot"] = {
            "status": "running" if bot and not bot.done() else
                      ("disabled" if not settings.bot_token else "not_running")
        }
        failures = sum(1 for item in checks.values() if item["status"] == "error")
        scanner_failed = checks["scanner"]["status"] != "running"
        bot_failed = checks["telegram_bot"]["status"] == "not_running"
        overall = "error" if failures else "degraded" if (scanner_failed or bot_failed) else "ok"
        return {
            "status": overall,
            "uptime_seconds": max(0, int(time.time() - app_started_at)),
            "checks": checks,
            "paper_trading_only": True,
            "live_execution": False,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    return router
