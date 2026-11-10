import asyncio, logging
from datetime import datetime, timedelta, timezone
from html import escape
from aiogram import Bot
from sqlalchemy import text
from app.config import settings
from app.database import SessionLocal, Signal, init_db, engine
from app.instance_lock import acquire_advisory_lock, release_advisory_lock
from app.market_data import market_data
from app.signals import generate_signal, is_quality_signal_values, signal_strength
from app.paper_trading import run_paper_trading_cycle

logger=logging.getLogger("trading-worker")
SYMBOLS=["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","LTCUSDT"]
TIMEFRAMES=["15m","1h","4h","1d"]
STRATEGIES={"15m":"scalping","1h":"intraday","4h":"swing","1d":"position"}
DUPLICATE_WINDOW_MINUTES=60
SCANNER_LOCK_ID=81420311

def ensure_database_schema():
    if engine.dialect.name != "postgresql":
        logger.info("Skipping PostgreSQL legacy schema migration on non-PostgreSQL database"); return
    statements=[
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS market VARCHAR(30) DEFAULT 'crypto'",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS grade VARCHAR(5)",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS entry_price DOUBLE PRECISION",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS stop_loss DOUBLE PRECISION",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS take_profit DOUBLE PRECISION",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS strategy VARCHAR(50)",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS reasoning TEXT",
      "ALTER TABLE signals ADD COLUMN IF NOT EXISTS indicators JSON",
      "ALTER TABLE signals ALTER COLUMN entry DROP NOT NULL",
      "ALTER TABLE signals ALTER COLUMN sl DROP NOT NULL",
      "ALTER TABLE signals ALTER COLUMN tp1 DROP NOT NULL",
      "ALTER TABLE signals ALTER COLUMN tp2 DROP NOT NULL",
      "ALTER TABLE signals ALTER COLUMN historical_winrate DROP NOT NULL",
      "ALTER TABLE signals ALTER COLUMN sample_size DROP NOT NULL",
      "ALTER TABLE signals ALTER COLUMN notes DROP NOT NULL"]
    with engine.begin() as conn:
        for stmt in statements: conn.execute(text(stmt))
    logger.info("Signal schema checked")

def already_exists(db, signal):
    cutoff=datetime.now(timezone.utc)-timedelta(minutes=DUPLICATE_WINDOW_MINUTES)
    q=db.query(Signal).filter(Signal.symbol==signal["symbol"],Signal.timeframe==signal["timeframe"],Signal.direction==signal["direction"],Signal.grade==signal["grade"],Signal.created_at>=cutoff,Signal.status.in_(["new","eligible","sent"]))
    return db.query(q.exists()).scalar()

def format_signal_message(signal):
    direction="ПОКУПКА" if signal.direction=="BUY" else "ПРОДАЖА"
    emoji="🟢" if signal.direction=="BUY" else "🔴"
    names={"scalping":"Scalping","intraday":"Intraday","swing":"Swing","position":"Position"}
    entry=float(signal.entry_price or 0); stop=float(signal.stop_loss or 0); target=float(signal.take_profit or 0)
    digits=2 if entry>=1000 else 4 if entry>=1 else 8
    reasoning=(signal.reasoning or "").strip()[:700]
    lines=[f"{emoji} <b>КАЧЕСТВЕННЫЙ ТОРГОВЫЙ СИГНАЛ</b>","",f"<b>{escape(signal.symbol)}</b> · {escape(signal.timeframe)}",f"Направление: <b>{direction}</b>",f"Сила: <b>{signal_strength(signal.direction,float(signal.score or 0)):.0f}/100</b> · Grade <b>{escape(signal.grade or '—')}</b>",f"Стратегия: {escape(names.get(signal.strategy,signal.strategy or '—'))}","",f"Вход: <code>{entry:,.{digits}f}</code>",f"Stop Loss: <code>{stop:,.{digits}f}</code>",f"Take Profit: <code>{target:,.{digits}f}</code>",""]
    if reasoning: lines += ["<b>Основание:</b>",escape(reasoning),""]
    lines += ["Режим: <b>Paper Trading</b>","Результат не гарантирован."]
    return "\n".join(lines)

async def deliver_pending_signals():
    if not settings.bot_token or not settings.owner_telegram_id: return 0
    db=SessionLocal(); delivered=0
    try:
        pending=db.query(Signal).filter(Signal.status=="new").order_by(Signal.id.asc()).limit(100).all()
        if not pending: return 0
        async with Bot(token=settings.bot_token) as bot:
            for signal in pending:
                try:
                    if not is_quality_signal_values(signal.direction,signal.score,signal.grade):
                        signal.status="filtered"; db.commit(); continue
                    await bot.send_message(chat_id=settings.owner_telegram_id,text=format_signal_message(signal),parse_mode="HTML",disable_web_page_preview=True)
                    signal.status="sent"; db.commit(); delivered+=1
                except Exception:
                    db.rollback(); logger.exception("Telegram delivery failed for signal id=%s",signal.id)
    finally: db.close()
    return delivered

async def scan_market():
    db=SessionLocal(); saved=0
    try:
        for symbol in SYMBOLS:
            for timeframe in TIMEFRAMES:
                try:
                    candles=await market_data.get_klines(symbol,timeframe,200)
                    signal=generate_signal(candles,symbol,timeframe,STRATEGIES[timeframe])
                    if not signal or not signal.get("eligible") or already_exists(db,signal): continue
                    db.add(Signal(symbol=signal["symbol"],market="crypto",timeframe=signal["timeframe"],direction=signal["direction"],grade=signal["grade"],score=signal["score"],confidence=signal.get("confidence"),entry_price=signal["entry_price"],stop_loss=signal["stop_loss"],take_profit=signal["take_profit"],strategy=signal["strategy"],reasoning="; ".join(signal.get("reasoning") or []),indicators=signal.get("indicators"),status="new"))
                    db.commit(); saved+=1
                    logger.info("Signal saved %s %s %s strength=%.0f grade=%s",symbol,timeframe,signal["direction"],signal_strength(signal["direction"],signal["score"]),signal["grade"])
                except Exception:
                    db.rollback(); logger.exception("Scan failed for %s %s",symbol,timeframe)
        logger.info("Scan completed. New quality signals: %s",saved)
    finally: db.close()
    return saved

async def run_worker():
    while True:
        lock_connection=None
        try:
            lock_connection=acquire_advisory_lock(SCANNER_LOCK_ID)
            if lock_connection is None: await asyncio.sleep(10); continue
            init_db(); ensure_database_schema()
            while True:
                try:
                    await scan_market(); await deliver_pending_signals(); await run_paper_trading_cycle()
                except asyncio.CancelledError: raise
                except Exception: logger.exception("Scanner cycle failed")
                await asyncio.sleep(max(60,settings.scan_interval_seconds))
        except asyncio.CancelledError: raise
        except Exception:
            logger.exception("Scanner supervisor failed"); await asyncio.sleep(15)
        finally:
            if lock_connection is not None:
                try: release_advisory_lock(lock_connection,SCANNER_LOCK_ID)
                except Exception: logger.exception("Could not release scanner advisory lock")

if __name__=="__main__":
    logging.basicConfig(level=logging.INFO); asyncio.run(run_worker())
