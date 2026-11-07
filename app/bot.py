from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from app.config import get_settings
from app.database import SessionLocal, latest_signals, Subscriber
from app.market_data import WATCHLIST, MarketData
from app.analyzer import analyze
from app.signals import SignalService

settings = get_settings()
bot = Bot(settings.bot_token) if settings.bot_token else None
dp = Dispatcher()


def main_keyboard():
    rows = [[InlineKeyboardButton(text="📊 Открыть Mini App", web_app=WebAppInfo(url=settings.mini_app_url))]] if settings.mini_app_url else []
    rows += [[InlineKeyboardButton(text="📈 Сводка", callback_data="summary"),
              InlineKeyboardButton(text="🟢 Сигналы", callback_data="signals")]]
    return InlineKeyboardMarkup(inline_keyboard=rows)


@dp.message(Command("start"))
async def start(m: Message):
    await m.answer("🤖 <b>Trading Intelligence PRO</b>\nРыночная аналитика и Paper Trading.\n\nИспользуйте /summary, /analyze BTC или /status.", reply_markup=main_keyboard(), parse_mode="HTML")


@dp.message(Command("help"))
async def help_cmd(m: Message):
    await m.answer("/analyze BTC|ETH|SOL|EURUSD|XAUUSD|NAS100\n/summary — обзор инструментов\n/signals — активные сигналы\n/history — архив\n/status — состояние сервисов")


@dp.message(Command("status"))
async def status(m: Message):
    await m.answer(f"🟢 Bot process online\nPaper trading: {settings.paper_trading}\nScan interval: {settings.scan_interval_seconds}s\nProvider: {settings.market_data_provider}\nNote: provider reachability is checked during analysis.")


@dp.message(Command("analyze"))
async def analyze_cmd(m: Message):
    parts = (m.text or "").split()
    if len(parts) < 2:
        await m.answer("Укажите актив: /analyze BTC")
        return
    aliases = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT"}
    symbol = aliases.get(parts[1].upper(), parts[1].upper())
    if symbol not in WATCHLIST:
        await m.answer("Доступно: BTC, ETH, SOL, EURUSD, XAUUSD, NAS100")
        return
    await m.answer(f"⏳ Анализирую {symbol}...")
    try:
        candles = await MarketData().candles(symbol, "1h", 1000)
        result = analyze(candles, symbol)
        if not result.get("signal"):
            await m.answer(f"⚪ {symbol}: сигнал не опубликован.\nПричина: {result['reason']}")
            return
        s = result["signal"]
        await m.answer(f"🟢 <b>{symbol} {s['direction']}</b>\nEntry: {s['entry']:.5g}\nSL: {s['sl']:.5g}\nTP1: {s['tp1']:.5g}\nTP2: {s['tp2']:.5g}\nИсторический winrate: {s['historical_winrate']}% ({s['sample_size']} сделок)\nScore: {s['score']}/100\n\nPaper signal; не финансовая рекомендация.", parse_mode="HTML")
    except Exception as e:
        await m.answer(f"Ошибка получения/анализа данных: {e}")


@dp.message(Command("summary"))
async def summary(m: Message):
    await m.answer("⏳ Формирую сводку...")
    lines = []
    for symbol in WATCHLIST:
        try:
            price = await MarketData().quote(symbol)
            lines.append(f"• {symbol}: {price:.6g}")
        except Exception as e:
            lines.append(f"• {symbol}: недоступен ({str(e)[:70]})")
    await m.answer("<b>Market summary</b>\n" + "\n".join(lines), parse_mode="HTML")


@dp.message(Command("signals"))
async def signals(m: Message):
    async with SessionLocal() as db:
        rows = await latest_signals(db, 20)
    active = [x for x in rows if x.status in ("ACTIVE", "TP1", "PUBLISHED")]
    if not active:
        return await m.answer("Активных сигналов пока нет.")
    await m.answer("\n\n".join(f"<b>{x.symbol} {x.direction}</b> · {x.status}\nEntry {x.entry:.6g} | SL {x.sl:.6g} | TP1 {x.tp1:.6g} | TP2 {x.tp2:.6g}" for x in active), parse_mode="HTML")


@dp.message(Command("history"))
async def history(m: Message):
    async with SessionLocal() as db:
        rows = await latest_signals(db, 30)
    closed = [x for x in rows if x.status == "CLOSED"]
    if not closed:
        return await m.answer("Закрытых paper-сделок пока нет.")
    await m.answer("\n".join(f"{x.symbol} {x.direction}: {x.result} · {x.created_at}" for x in closed))


@dp.callback_query(F.data == "summary")
async def summary_cb(c):
    await summary(c.message)
    await c.answer()


@dp.callback_query(F.data == "signals")
async def signals_cb(c):
    await signals(c.message)
    await c.answer()


async def publish_text(text):
    if not bot:
        return
    async with SessionLocal() as db:
        subscribers = list((await db.execute(__import__("sqlalchemy").select(Subscriber))).scalars())
    for subscriber in subscribers:
        try:
            await bot.send_message(subscriber.chat_id, text, parse_mode="HTML")
        except Exception:
            continue


class TelegramNotifier:
    async def publish_signal(self, s):
        if not bot:
            return
        text = (
            f"📡 <b>{s['symbol']} · {s['direction']}</b>\n"
            f"Entry: <code>{s['entry']:.6g}</code>\nSL: <code>{s['sl']:.6g}</code>\n"
            f"TP1: <code>{s['tp1']:.6g}</code>\nTP2: <code>{s['tp2']:.6g}</code>\n"
            f"Historical winrate: <b>{s['historical_winrate']}%</b> ({s['sample_size']} trades)\n"
            f"Score: {s['score']}/100\n\n🧪 Paper Trading · Не является финансовой рекомендацией"
        )
        await publish_text(text)


async def run_polling():
    if bot:
        await dp.start_polling(bot)
