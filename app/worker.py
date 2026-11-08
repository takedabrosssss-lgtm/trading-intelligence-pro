import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import SessionLocal, Signal, init_db
from app.market_data import market_data
from app.signals import generate_signal

logger = logging.getLogger("trading-worker")

SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
    "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
    "LINKUSDT", "LTCUSDT",
]

TIMEFRAMES = ["15m", "1h", "4h"]

STRATEGIES = {
    "15m": "scalping",
    "1h": "intraday",
    "4h": "swing",
}

DUPLICATE_WINDOW_MINUTES = 60


def already_exists(db, signal):
    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=DUPLICATE_WINDOW_MINUTES
    )

    query = db.query(Signal).filter(
        Signal.symbol == signal["symbol"],
        Signal.timeframe == signal["timeframe"],
        Signal.direction == signal["direction"],
        Signal.grade == signal["grade"],
        Signal.created_at >= cutoff,
        Signal.status.in_(["new", "eligible"]),
    )

    return db.query(query.exists()).scalar()


async def scan_market():
    db = SessionLocal()
    saved = 0

    try:
        for symbol in SYMBOLS:
            for timeframe in TIMEFRAMES:
                try:
                    candles = await market_data.get_klines(
                        symbol, timeframe, 200
                    )

                    signal = generate_signal(
                        symbol=symbol,
                        timeframe=timeframe,
                        candles=candles,
                        strategy=STRATEGIES[timeframe],
                    )

                    if not signal or not signal.get("eligible"):
                        continue

                    if already_exists(db, signal):
                        continue

                    record = Signal(
                        symbol=signal["symbol"],
                        market="crypto",
                        timeframe=signal["timeframe"],
                        direction=signal["direction"],
                        grade=signal["grade"],
                        score=signal["score"],
                        confidence=None,
                        entry_price=signal["entry_price"],
                        stop_loss=signal["stop_loss"],
                        take_profit=signal["take_profit"],
                        strategy=signal["strategy"],
                        reasoning="; ".join(signal["reasoning"]),
                        indicators=signal["indicators"],
                        status="new",
                    )

                    db.add(record)
                    db.commit()
                    saved += 1

                    logger.info(
                        "New signal: %s %s %s grade=%s",
                        symbol,
                        timeframe,
                        signal["direction"],
                        signal["grade"],
                    )

                except Exception:
                    db.rollback()
                    logger.exception(
                        "Scan failed for %s %s", symbol, timeframe
                    )

        logger.info("Scan completed. New signals: %s", saved)

    finally:
        db.close()

    return saved


async def run_worker():
    init_db()
    logger.info("Trading Intelligence scanner started")

    while True:
        try:
            await scan_market()
        except Exception:
            logger.exception("Scanner cycle failed")

        await asyncio.sleep(settings.scan_interval_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
