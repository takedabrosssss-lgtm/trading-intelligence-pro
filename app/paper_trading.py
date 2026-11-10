import logging
from datetime import datetime, timedelta, timezone
from app.config import settings
from app.database import PaperAccount, Position, SessionLocal, Signal, Trade
from app.market_data import market_data
from app.signals import is_quality_signal_values
from app.risk_engine import assess_position

logger=logging.getLogger("paper-trading")
FEE_RATE=0.001
MAX_OPEN_POSITIONS_PER_ACCOUNT=3


def _as_utc(value):
    if value is None: return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _signal_max_age(timeframe):
    return {"15m":timedelta(minutes=30),"1h":timedelta(hours=2),"4h":timedelta(hours=8),"1d":timedelta(days=3)}.get(timeframe,timedelta(hours=1))


def _account_equity(db,account):
    positions=db.query(Position).filter(Position.account_id==account.id,Position.status=="open").all()
    return float(account.balance or 0)+sum(float(p.unrealized_pnl or 0) for p in positions)


def _close_position(db,position,exit_price,reason):
    account=db.query(PaperAccount).filter(PaperAccount.id==position.account_id).first()
    if account is None: raise RuntimeError(f"Paper account missing for position {position.id}")
    entry=float(position.entry_price); qty=float(position.quantity); exit_price=float(exit_price)
    gross=((exit_price-entry)*qty if position.direction=="BUY" else (entry-exit_price)*qty)
    fees=(entry*qty+exit_price*qty)*FEE_RATE; net=gross-fees
    db.add(Trade(account_id=account.id,position_id=position.id,symbol=position.symbol,direction=position.direction,strategy=account.strategy,entry_price=entry,exit_price=exit_price,quantity=qty,gross_pnl=gross,fees=fees,net_pnl=net,exit_reason=reason,closed_at=datetime.now(timezone.utc)))
    account.balance=float(account.balance or 0)+net
    position.current_price=exit_price; position.unrealized_pnl=0.0; position.realized_pnl=net; position.status="closed"; position.closed_at=datetime.now(timezone.utc)
    logger.info("Paper position closed id=%s %s reason=%s net=%.4f",position.id,position.symbol,reason,net)


async def update_open_positions():
    db=SessionLocal(); updated=0
    try:
        ids=[row[0] for row in db.query(Position.id).filter(Position.status=="open").all()]
        for position_id in ids:
            try:
                position=db.query(Position).filter(Position.id==position_id,Position.status=="open").first()
                if position is None: continue
                quote=await market_data.get_price(position.symbol); price=float(quote["price"])
                if price<=0: continue
                entry=float(position.entry_price); qty=float(position.quantity)
                if position.direction=="BUY":
                    gross=(price-entry)*qty
                    stop_hit=position.stop_loss is not None and price<=float(position.stop_loss)
                    target_hit=position.take_profit is not None and price>=float(position.take_profit)
                else:
                    gross=(entry-price)*qty
                    stop_hit=position.stop_loss is not None and price>=float(position.stop_loss)
                    target_hit=position.take_profit is not None and price<=float(position.take_profit)
                position.current_price=price
                position.unrealized_pnl=gross-(entry*qty+price*qty)*FEE_RATE
                if stop_hit:
                    # A stop-market fill cannot be better than the observed gapped market price.
                    _close_position(db,position,price,"stop_loss_gap" if ((position.direction=="BUY" and price<float(position.stop_loss)) or (position.direction=="SELL" and price>float(position.stop_loss))) else "stop_loss")
                elif target_hit:
                    # Conservative target execution: do not assume price improvement through the limit.
                    _close_position(db,position,float(position.take_profit),"take_profit")
                db.commit(); updated+=1
            except Exception:
                db.rollback(); logger.exception("Could not update paper position id=%s",position_id)
    except Exception:
        db.rollback(); logger.exception("Paper position update failed")
    finally: db.close()
    return updated


async def open_paper_positions():
    db=SessionLocal(); opened=0
    try:
        signal_ids=[row[0] for row in db.query(Signal.id).filter(Signal.status.in_(["new","sent"])).order_by(Signal.id.asc()).limit(100).all()]
        for signal_id in signal_ids:
            try:
                signal=db.query(Signal).filter(Signal.id==signal_id).first()
                if signal is None or signal.status not in {"new","sent"}: continue
                if not is_quality_signal_values(signal.direction,signal.score,signal.grade):
                    signal.status="paper_skipped"; db.commit(); continue
                existing=db.query(Position).filter(Position.signal_id==signal.id).first()
                if existing:
                    signal.status="paper_opened" if existing.status=="open" else "paper_closed"; db.commit(); continue
                created=_as_utc(signal.created_at)
                if created and datetime.now(timezone.utc)-created>_signal_max_age(signal.timeframe):
                    signal.status="paper_skipped"; db.commit(); continue
                strategy=(signal.strategy or "").lower()
                account=db.query(PaperAccount).filter(PaperAccount.strategy==strategy,PaperAccount.is_active.is_(True)).first()
                if account is None:
                    signal.status="paper_skipped"; db.commit(); continue
                signal_entry=float(signal.entry_price or 0); stop=float(signal.stop_loss or 0); target=float(signal.take_profit or 0)
                valid=(stop<signal_entry<target) if signal.direction=="BUY" else (target<signal_entry<stop) if signal.direction=="SELL" else False
                if not valid:
                    signal.status="paper_skipped"; db.commit(); continue
                open_positions=db.query(Position).filter(Position.account_id==account.id,Position.status=="open").all()
                if len(open_positions)>=MAX_OPEN_POSITIONS_PER_ACCOUNT or any(p.symbol==signal.symbol for p in open_positions):
                    db.commit(); continue
                equity=_account_equity(db,account)
                max_dd=float(account.max_drawdown or settings.max_drawdown)
                if equity<=float(account.initial_balance or 0)*(1-max_dd) or equity<=0:
                    db.commit(); continue
                quote=await market_data.get_price(signal.symbol); live_entry=float(quote["price"])
                if live_entry<=0 or abs(live_entry-signal_entry)>abs(signal_entry-stop)*0.5:
                    signal.status="paper_skipped"; db.commit(); continue
                if signal.direction=="BUY" and not stop<live_entry<target or signal.direction=="SELL" and not target<live_entry<stop:
                    signal.status="paper_skipped"; db.commit(); continue
                decision=assess_position(equity=equity,entry=live_entry,stop=stop,open_positions=open_positions,
                                         max_risk_fraction=float(settings.max_risk_per_trade),max_total_risk_fraction=0.04,
                                         max_exposure_fraction=0.90,max_positions=MAX_OPEN_POSITIONS_PER_ACCOUNT)
                if not decision.allowed:
                    logger.info("Paper signal %s blocked by risk engine: %s",signal.id,decision.reason)
                    db.commit(); continue
                qty=decision.quantity
                position=Position(account_id=account.id,signal_id=signal.id,symbol=signal.symbol,direction=signal.direction,
                    entry_price=live_entry,current_price=live_entry,stop_loss=stop,take_profit=target,quantity=qty,
                    unrealized_pnl=-2*live_entry*qty*FEE_RATE,status="open")
                db.add(position); signal.status="paper_opened"; db.commit(); opened+=1
                logger.info("Paper position opened signal=%s position=%s %s qty=%.8f entry=%.8f reserved_risk=%.2f",signal.id,position.id,signal.symbol,qty,live_entry,decision.reserved_risk)
            except Exception:
                db.rollback(); logger.exception("Could not process paper signal id=%s",signal_id)
    except Exception:
        db.rollback(); logger.exception("Paper position opening failed")
    finally: db.close()
    return opened


async def run_paper_trading_cycle():
    updated=await update_open_positions(); opened=await open_paper_positions()
    logger.info("Paper trading cycle complete: opened=%s updated=%s",opened,updated)
    return opened,updated
