import asyncio
import logging
from html import escape

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command
from aiogram.types import (
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)

from app.config import settings
from app.database import SessionLocal, PaperAccount, Signal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("qorix-bot")

router = Router()


def authorized(message: Message) -> bool:
    return (
        message.from_user is not None
        and str(message.from_user.id) in settings.allowed_user_ids
    )


def mini_app_keyboard():
    if not settings.mini_app_url:
        return None

    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="Открыть QORIX",
                web_app=WebAppInfo(url=settings.mini_app_url),
            )
        ]]
    )


@router.message(Command("start"))
async def start_command(message: Message):
    if not authorized(message):
        await message.answer("Доступ запрещён.")
        return

    await message.answer(
        "<b>QORIX</b>\n"
        "<i>Elite Quant Intelligence</i>\n\n"
        "Персональная интеллектуальная торговая система.\n"
        "Режим: Paper Trading.\n\n"
        "Команды:\n"
        "/summary — виртуальный портфель\n"
        "/signals — последние сигналы\n"
        "/status — состояние системы\n"
        "/help — справка",
        reply_markup=mini_app_keyboard(),
        parse_mode="HTML",
    )


@router.message(Command("help"))
async def help_command(message: Message):
    if not authorized(message):
        await message.answer("Доступ запрещён.")
        return

    await message.answer(
        "<b>QORIX — команды</b>\n\n"
        "/start — главное меню\n"
        "/summary — состояние виртуальных счетов\n"
        "/signals — последние сохранённые сигналы\n"
        "/status — состояние системы\n"
        "/help — эта справка",
        parse_mode="HTML",
    )


@router.message(Command("status"))
async def status_command(message: Message):
    if not authorized(message):
        await message.answer("Доступ запрещён.")
        return

    await message.answer(
        "<b>QORIX</b>\n\n"
        "Telegram Bot: online\n"
        "Режим: Paper Trading\n"
        "Рыночные данные: Binance Spot / Kraken Spot fallback\n"
        "Исполнение реальных ордеров: отключено",
        parse_mode="HTML",
    )


@router.message(Command("summary"))
async def summary_command(message: Message):
    if not authorized(message):
        await message.answer("Доступ запрещён.")
        return

    db = SessionLocal()

    try:
        accounts = db.query(PaperAccount).all()

        if not accounts:
            await message.answer("Виртуальные счета пока не созданы.")
            return

        total_balance = sum(
            float(account.balance or 0)
            for account in accounts
        )

        total_initial = sum(
            float(account.initial_balance or 0)
            for account in accounts
        )

        pnl = total_balance - total_initial

        lines = [
            "<b>QORIX · Виртуальный портфель</b>",
            "",
            f"Начальный капитал: ${total_initial:,.2f}",
            f"Баланс: ${total_balance:,.2f}",
            f"PnL: {'+' if pnl >= 0 else ''}${pnl:,.2f}",
            "",
        ]

        for account in accounts:
            lines.append(
                f"<b>{escape(account.name)}</b>: "
                f"${float(account.balance or 0):,.2f}"
            )

        await message.answer(
            "\n".join(lines),
            parse_mode="HTML",
        )

    finally:
        db.close()


@router.message(Command("signals"))
async def signals_command(message: Message):
    if not authorized(message):
        await message.answer("Доступ запрещён.")
        return

    db = SessionLocal()

    try:
        signals = (
            db.query(Signal)
            .filter(Signal.status.in_(["new", "eligible", "sent"]))
            .order_by(Signal.id.desc())
            .limit(10)
            .all()
        )

        if not signals:
            await message.answer(
                "Новых подходящих сигналов пока нет."
            )
            return

        lines = [
            "<b>QORIX · Последние торговые сигналы</b>",
            "",
        ]

        for signal in signals:
            direction = (
                "ПОКУПКА"
                if signal.direction == "BUY"
                else "ПРОДАЖА"
            )

            lines.extend([
                f"<b>{escape(signal.symbol)}</b> · "
                f"{escape(signal.timeframe)}",
                f"Направление: {direction}",
                f"Оценка: {int(signal.score or 0)}/100 · "
                f"Grade {escape(signal.grade or '—')}",
                f"Вход: {float(signal.entry_price or 0):,.8g}",
                f"SL: {float(signal.stop_loss or 0):,.8g} · "
                f"TP: {float(signal.take_profit or 0):,.8g}",
                "",
            ])

        await message.answer(
            "\n".join(lines),
            parse_mode="HTML",
        )

    finally:
        db.close()


async def run_bot():
    if not settings.bot_token:
        raise RuntimeError("BOT_TOKEN is not configured")

    if not settings.allowed_user_ids:
        raise RuntimeError("OWNER_TELEGRAM_ID is not configured")

    bot = Bot(token=settings.bot_token)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)

    logger.info("QORIX Telegram bot starting")

    try:
        await bot.delete_webhook(drop_pending_updates=False)
        await dispatcher.start_polling(bot)

    finally:
        await bot.session.close()


async def main():
    await run_bot()


if __name__ == "__main__":
    asyncio.run(main())
