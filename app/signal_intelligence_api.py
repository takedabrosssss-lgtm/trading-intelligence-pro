"""MIRAGE 4.2 read-only signal performance and risk intelligence."""
import asyncio
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends

from app.config import settings
from app.database import SessionLocal, Signal, PaperAccount, Position, Trade
from app.market_data import market_data
from app.signals import closed_candles

logger = logging.getLogger("mirage4.signal_intelligence")
TRACKED_STATUSES = {"new", "sent", "paper_opened", "paper_closed", "paper_skipped"}
MAX_TRACKED_SIGNALS = 24
OUTCOME_HORIZON_BARS = 20


def _utc(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _signal_path(signal, candles):
    entry = float(signal.entry_price or 0)
    stop = float(signal.stop_loss or 0)
    target = float(signal.take_profit or 0)
    created = _utc(signal.created_at)
    if entry <= 0 or stop <= 0 or target <= 0 or created is None:
        return {"outcome": "unavailable", "bars_observed": 0, "mfe_pct": None, "mae_pct": None}

    after = [c for c in candles if int(c.get("timestamp", 0)) >= int(created.timestamp() * 1000)]
    after = after[:OUTCOME_HORIZON_BARS]
    if not after:
        return {"outcome": "no_recent_candles", "bars_observed": 0, "mfe_pct": None, "mae_pct": None}

    favorable = 0.0
    adverse = 0.0
    outcome = "open" if len(after) < OUTCOME_HORIZON_BARS else "expired"
    resolved_at = None
    bars_to_resolution = None

    for index, candle in enumerate(after, start=1):
        high = float(candle["high"])
        low = float(candle["low"])
        if signal.direction == "BUY":
            favorable = max(favorable, (high - entry) / entry * 100)
            adverse = min(adverse, (low - entry) / entry * 100)
            stop_hit, target_hit = low <= stop, high >= target
        else:
            favorable = max(favorable, (entry - low) / entry * 100)
            adverse = min(adverse, (entry - high) / entry * 100)
            stop_hit, target_hit = high >= stop, low <= target

        if stop_hit and target_hit:
            outcome = "ambiguous_stop_first"
            resolved_at = int(candle.get("timestamp", 0))
            bars_to_resolution = index
            break
        if stop_hit:
            outcome = "stop_loss"
            resolved_at = int(candle.get("timestamp", 0))
            bars_to_resolution = index
            break
        if target_hit:
            outcome = "take_profit"
            resolved_at = int(candle.get("timestamp", 0))
            bars_to_resolution = index
            break

    return {
        "outcome": outcome,
        "bars_observed": len(after) if bars_to_resolution is None else bars_to_resolution,
        "bars_to_resolution": bars_to_resolution,
        "mfe_pct": round(favorable, 3),
        "mae_pct": round(adverse, 3),
        "resolved_candle_timestamp": resolved_at,
        "method": "OHLC path estimate; same-candle stop/target collision counted conservatively as stop first",
    }


async def _load_group(symbol, timeframe, semaphore):
    async with semaphore:
        try:
            candles = await asyncio.wait_for(market_data.get_klines(symbol, timeframe, 200), timeout=9)
            return (symbol, timeframe), closed_candles(candles, timeframe)
        except Exception as exc:
            logger.warning("Signal path candles unavailable for %s %s: %s", symbol, timeframe, type(exc).__name__)
            return (symbol, timeframe), []


def build_signal_intelligence_router(require_user):
    router = APIRouter(prefix="/api/mirage", tags=["mirage-4.2"])

    @router.get("/signal-intelligence")
    async def signal_intelligence(user=Depends(require_user)):
        db = SessionLocal()
        try:
            signals = (
                db.query(Signal)
                .filter(Signal.status.in_(TRACKED_STATUSES))
                .order_by(Signal.created_at.desc(), Signal.id.desc())
                .limit(MAX_TRACKED_SIGNALS)
                .all()
            )
            accounts = db.query(PaperAccount).order_by(PaperAccount.id.asc()).all()
            open_positions = db.query(Position).filter(Position.status == "open").all()
            positions_by_account = {}
            for position in open_positions:
                positions_by_account.setdefault(position.account_id, []).append(position)

            signal_ids = [s.id for s in signals]
            linked_positions = db.query(Position).filter(Position.signal_id.in_(signal_ids)).all() if signal_ids else []
            position_ids = [p.id for p in linked_positions]
            trades = db.query(Trade).filter(Trade.position_id.in_(position_ids), Trade.closed_at.isnot(None)).all() if position_ids else []
            trade_by_position = {t.position_id: t for t in trades}
            position_by_signal = {p.signal_id: p for p in linked_positions}

            groups = sorted({(s.symbol, s.timeframe) for s in signals})
            semaphore = asyncio.Semaphore(3)
            loaded = await asyncio.gather(*[_load_group(symbol, timeframe, semaphore) for symbol, timeframe in groups])
            candles_by_group = dict(loaded)

            signal_rows = []
            path_wins = path_losses = path_open = path_expired = 0
            for s in signals:
                path = _signal_path(s, candles_by_group.get((s.symbol, s.timeframe), []))
                if path["outcome"] == "take_profit":
                    path_wins += 1
                elif path["outcome"] in {"stop_loss", "ambiguous_stop_first"}:
                    path_losses += 1
                elif path["outcome"] == "open":
                    path_open += 1
                elif path["outcome"] == "expired":
                    path_expired += 1

                position = position_by_signal.get(s.id)
                trade = trade_by_position.get(position.id) if position else None
                signal_rows.append({
                    "id": s.id, "symbol": s.symbol, "timeframe": s.timeframe,
                    "direction": s.direction, "grade": s.grade,
                    "strength": float(s.confidence) if s.confidence is not None else None,
                    "status": s.status, "created_at": s.created_at.isoformat() if s.created_at else None,
                    "entry_price": float(s.entry_price) if s.entry_price is not None else None,
                    "stop_loss": float(s.stop_loss) if s.stop_loss is not None else None,
                    "take_profit": float(s.take_profit) if s.take_profit is not None else None,
                    "reward_risk": round(abs(float(s.take_profit or 0) - float(s.entry_price or 0)) / abs(float(s.entry_price or 0) - float(s.stop_loss or 0)), 2) if s.entry_price and s.stop_loss and s.take_profit and s.entry_price != s.stop_loss else None,
                    "path": path,
                    "paper_trade": ({"net_pnl": round(float(trade.net_pnl or 0), 2), "exit_reason": trade.exit_reason, "closed_at": trade.closed_at.isoformat() if trade.closed_at else None} if trade else None),
                })

            closed_pnls = [float(t.net_pnl or 0) for t in trades]
            wins = [p for p in closed_pnls if p > 0]
            losses = [p for p in closed_pnls if p < 0]

            risk_accounts = []
            for account in accounts:
                positions = positions_by_account.get(account.id, [])
                balance = float(account.balance or 0)
                unrealized = sum(float(p.unrealized_pnl or 0) for p in positions)
                equity = balance + unrealized
                exposure = 0.0
                reserved_risk = 0.0
                for p in positions:
                    qty = max(0.0, float(p.quantity or 0))
                    current = float(p.current_price or p.entry_price or 0)
                    entry = float(p.entry_price or 0)
                    exposure += qty * current
                    if p.stop_loss is None or entry <= 0:
                        reserved_risk += qty * max(current, entry)
                    else:
                        reserved_risk += qty * abs(entry - float(p.stop_loss))
                risk_accounts.append({
                    "name": account.name, "strategy": account.strategy,
                    "equity": round(equity, 2), "open_positions": len(positions),
                    "exposure": round(exposure, 2),
                    "exposure_pct": round(exposure / equity * 100, 2) if equity > 0 else None,
                    "reserved_stop_risk": round(reserved_risk, 2),
                    "reserved_risk_pct": round(reserved_risk / equity * 100, 2) if equity > 0 else None,
                    "max_risk_per_trade_pct": round(settings.max_risk_per_trade * 100, 2),
                    "max_total_risk_pct": 4.0,
                })

            return {
                "mode": "paper_only",
                "tracking": {
                    "signals_sampled": len(signals),
                    "path_resolved": path_wins + path_losses,
                    "path_wins": path_wins, "path_losses": path_losses,
                    "path_win_rate_pct": round(path_wins / (path_wins + path_losses) * 100, 2) if path_wins + path_losses else None,
                    "path_open": path_open, "path_expired": path_expired,
                    "path_method": "OHLC candle path estimate, not executed trade P&L",
                },
                "paper_performance": {
                    "closed_trades": len(closed_pnls), "wins": len(wins), "losses": len(losses),
                    "win_rate_pct": round(len(wins) / len(closed_pnls) * 100, 2) if closed_pnls else None,
                    "net_pnl": round(sum(closed_pnls), 2),
                    "profit_factor": round(sum(wins) / abs(sum(losses)), 3) if losses else ("inf" if wins else None),
                },
                "risk_accounts": risk_accounts,
                "signals": signal_rows,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "disclaimer": "Path outcomes are estimated from OHLC candles. If stop and target are both touched in one candle, the stop is counted first. They are not fills or guarantees.",
            }
        finally:
            db.close()

    return router
