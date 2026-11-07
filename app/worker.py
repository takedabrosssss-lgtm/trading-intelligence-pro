import asyncio, logging
from app.config import get_settings
from app.signals import SignalService, track_open_signals
from app.bot import TelegramNotifier

async def main():
    s=get_settings()
    service=SignalService(TelegramNotifier())
    while True:
        try:
            await service.scan_all()
            await track_open_signals()
        except Exception:
            logging.exception("Worker cycle failed")
        await asyncio.sleep(max(30,s.scan_interval_seconds))

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
