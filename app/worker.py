
import asyncio
import logging
from datetime import datetime, timezone

from app.config import settings
from app.database import SessionLocal, Signal
from app.market_data import market_data, MarketDataError
from app.signals import generate_signal, deduplicate_signals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SYMBOLS = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "LTCUSDT",
]

TIMEFRAMES = [
    "15m",
    "1h",
    "4h",
]

STRATEGIES = {
    "15m": "scalping",
    "1h": "intraday",
    "4h": "swing",
}


async def analyze_symbol(symbol: str, timeframe: str):
    try:
        candles = await market_data.get_klines(
            symbol=symbol,
            interval=timeframe,
            limit=200,
        )

        signal = generate_signal(
            symbol=symbol,
            candles=candles,
            market="crypto",
            timeframe=timeframe,
            strategy=STRATEGIES[timeframe],
        )

        if signal.get("status") != "new":
            return None

        return signal

    except (MarketDataError, ValueError) as exc:
        logger.warning(
            "Analysis failed for %s %s: %s",
            symbol,
            timeframe,
            exc,
        )
        return None

    except Exception:
        logger.exception(
            "Unexpected analysis error for %s %s",
            symbol,
            timeframe,
        )
        return None


def save_signals(signals: list[dict]) -> int:
    if not signals:
        return 0

    db = SessionLocal()
    saved = 0

    try:
        signals = deduplicate_signals(signals)

        for item in signals:
            created_at = datetime.fromisoformat(
                item["created_at"]
            )

            duplicate = (
                db.query(Signal)
                .filter(
                    Signal.symbol == item["symbol"],
                    Signal.timeframe == item["timeframe"],
                    Signal.direction == item["direction"],
                    Signal.strategy == item["strategy"],
                    Signal.created_at >= created_at.replace(
                        tzinfo=None
                    ),
                )
                .first()
            )

            if duplicate:
                continue

            db.add(
                Signal(
                    symbol=item["symbol"],
                    market=item["market"],
                    timeframe=item["timeframe"],
                    direction=item["direction"],
                    grade=item["grade"],
                    confidence_score=item["confidence_score"],
                    entry_price=item["entry_price"],
                    stop_loss=item["stop_loss"],
                    take_profit=item["take_profit"],
                    strategy=item["strategy"],
                    reasoning="; ".join(item["reasoning"]),
                    indicators=item["indicators"],
                    status="new",
                )
            )

            saved += 1

        db.commit()
        return saved

    except Exception:
        db.rollback()
        logger.exception("Could not save signals")
        return 0

    finally:
        db.close()


async def scan_market():
    logger.info("Starting market scan.")

    discovered = []

    for symbol in SYMBOLS:
        for timeframe in TIMEFRAMES:
            signal = await analyze_symbol(
                symbol,
                timeframe,
            )

            if signal:
                discovered.append(signal)

    saved = save_signals(discovered)

    logger.info(
        "Market scan completed. Found: %s, saved: %s",
        len(discovered),
        saved,
    )

    return discovered


async def run_worker():
    interval = max(
        60,
        settings.SCAN_INTERVAL_SECONDS,
    )

    logger.info(
        "Market scanner started. Interval: %s seconds.",
        interval,
    )

    while True:
        started = datetime.now(timezone.utc)

        try:
            await scan_market()

        except Exception:
            logger.exception("Market scan failed.")

        elapsed = (
            datetime.now(timezone.utc) - started
        ).total_seconds()

        await asyncio.sleep(
            max(5, interval - elapsed)
        )


if __name__ == "__main__":
    asyncio.run(run_worker())
    
