from datetime import datetime, timezone
from sqlalchemy import select
from app.database import Signal
from app.market_data import MarketData, WATCHLIST
from app.analyzer import analyze

class SignalService:
    def __init__(self, notifier=None):
        self.data = MarketData()
        self.notifier = notifier

    async def scan_symbol(self, symbol):
        candles = await self.data.candles(symbol, "1h", 1000)
        result = analyze(candles, symbol, "1h")
        if not result.get("signal"):
            return result

        s = result["signal"]
        from app.database import SessionLocal

        async with SessionLocal() as db:
            q = await db.execute(
                select(Signal).where(
                    Signal.symbol == symbol,
                    Signal.status.in_(["PUBLISHED", "ACTIVE"])
                )
            )
            if q.scalars().first():
                return {
                    "symbol": symbol,
                    "signal": None,
                    "reason": "Existing active signal."
                }

            row = Signal(
                symbol=symbol,
                direction=s["direction"],
                timeframe=s["timeframe"],
                entry=s["entry"],
                sl=s["sl"],
                tp1=s["tp1"],
                tp2=s["tp2"],
                historical_winrate=s["historical_winrate"],
                sample_size=s["sample_size"],
                score=s["score"],
                status="ACTIVE",
                notes=s["notes"]
            )
            db.add(row)
            await db.commit()
            await db.refresh(row)
            s["id"] = row.id

        if self.notifier:
            await self.notifier.publish_signal(s)

        return {
            "symbol": symbol,
            "signal": s,
            "reason": "Published and paper-tracked."
        }

    async def scan_all(self):
        results = []
        for symbol in WATCHLIST:
            try:
                results.append(await self.scan_symbol(symbol))
            except Exception as e:
                results.append({
                    "symbol": symbol,
                    "signal": None,
                    "reason": str(e)
                })
        return results


async def track_open_signals():
    from app.database import SessionLocal
    from app.market_data import MarketData
    from sqlalchemy import select

    data = MarketData()

    async with SessionLocal() as db:
        rows = list((
            await db.execute(
                select(Signal).where(
                    Signal.status.in_(["ACTIVE", "TP1"])
                )
            )
        ).scalars())

        for s in rows:
            try:
                price = await data.quote(s.symbol)
            except Exception:
                continue

            if s.direction == "LONG":
                if price <= s.sl:
                    s.status = "CLOSED"
                    s.result = "SL"
                elif price >= s.tp2:
                    s.status = "CLOSED"
                    s.result = "TP2"
                elif price >= s.tp1:
                    s.status = "TP1"
            else:
                if price >= s.sl:
                    s.status = "CLOSED"
                    s.result = "SL"
                elif price <= s.tp2:
                    s.status = "CLOSED"
                    s.result = "TP2"
                elif price <= s.tp1:
                    s.status = "TP1"

            if s.status == "CLOSED":
                s.closed_at = datetime.now(timezone.utc)

        await db.commit()
