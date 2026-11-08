
import asyncio
import logging

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from app.config import settings
from app.database import PaperAccount, Position, SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = Router()


def is_authorized(message: Message) -> bool:
    allowed_ids = settings.allowed_user_ids

    if not allowed_ids or message.from_user is None:
        return False

    return str(message.from_user.id) in allowed_ids


def main_menu() -> InlineKeyboardMarkup:
    buttons = []

    if settings.MINI_APP_URL:
        buttons.append([
            InlineKeyboardButton(
                text="Открыть Trading Intelligence PRO",
                web_app=WebAppInfo(url=settings.MINI_APP_URL),
            )
        ])

    buttons.extend([
        [
            InlineKeyboardButton(
                text="Портфель",
                callback_data="portfolio",
            ),
            InlineKeyboardButton(
                text="Сигналы",
                callback_data="signals",
            ),
        ],
        [
            InlineKeyboardButton(
                text="Статус системы",
                callback_data="status",
            )
        ],
    ])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(CommandStart())
async def start_command(message: Message):
    if not is_authorized(message):
        await message.answer(
            "Доступ запрещён. Этот бот предназначен для личного использования."
        )
        return

    await message.answer(
        "Trading Intelligence PRO 2.0\n\n"
        "Персональная торговая аналитическая система.\n"
        "Режим: Paper Trading.\n"
        "Реальные ордера не размещаются.",
        reply_markup=main_menu(),
    )


@router.message(Command("help"))
async def help_command(message: Message):
    if not is_authorized(message):
        return

    await message.answer(
        "Команды Trading Intelligence PRO:\n\n"
        "/start — главное меню\n"
        "/summary — состояние виртуального портфеля\n"
        "/signals — список последних сигналов\n"
        "/status — состояние бота"
    )


@router.message(Command("summary"))
async def summary_command(message: Message):
    if not is_authorized(message):
        return

    db = SessionLocal()

    try:
        accounts = db.query(PaperAccount).all()

        if not accounts:
            await message.answer("Виртуальные счета пока не созданы.")
            return

        initial = sum(a.initial_balance for a in accounts)
        balance = sum(a.balance for a in accounts)

        unrealized = 0.0

        for account in accounts:
            positions = (
                db.query(Position)
                .filter(
                    Position.account_id == account.id,
                    Position.status == "open",
                )
                .all()
            )

            unrealized += sum(
                p.unrealized_pnl or 0 for p in positions
            )

        equity = balance + unrealized
        pnl = equity - initial

        await message.answer(
            "VIRTUAL PORTFOLIO\n\n"
            f"Начальный капитал: ${initial:,.2f}\n"
            f"Баланс: ${balance:,.2f}\n"
            f"Нереализованный PnL: ${unrealized:,.2f}\n"
            f"Equity: ${equity:,.2f}\n"
            f"Общий PnL: ${pnl:,.2f}\n\n"
            "Режим: Paper Trading"
        )

    except Exception:
        logger.exception("Portfolio summary failed")
        await message.answer("Не удалось получить данные портфеля.")

    finally:
        db.close()


@router.message(Command("signals"))
async def signals_command(message: Message):
    if not is_authorized(message):
        return

    await message.answer(
        "Модуль сигналов подключается.\n"
        "Автоматический сканер будет активирован "
        "после настройки фонового процесса."
    )


@router.message(Command("status"))
async def status_command(message: Message):
    if not is_authorized(message):
        return

    await message.answer(
        "Trading Intelligence PRO 2.0\n\n"
        "Telegram Bot: активен\n"
        "Режим: Paper Trading\n"
        "Реальная торговля: отключена\n"
        "Автоматический сканер: требует настройки"
    )


@router.callback_query()
async def menu_callback(callback):
    if callback.from_user is None:
        await callback.answer()
        return

    if str(callback.from_user.id) not in settings.allowed_user_ids:
        await callback.answer("Доступ запрещён.", show_alert=True)
        return

    if callback.data == "portfolio":
        await callback.answer()
        await summary_command(callback.message)

    elif callback.data == "signals":
        await callback.answer()
        await signals_command(callback.message)

    elif callback.data == "status":
        await callback.answer()
        await status_command(callback.message)

    else:
        await callback.answer()


async def notify_user(
    bot: Bot,
    telegram_id: int,
    text: str,
):
    """Send a notification to the authorized owner."""

    if str(telegram_id) not in settings.allowed_user_ids:
        logger.warning("Notification blocked for unauthorized user")
        return

    await bot.send_message(
        chat_id=telegram_id,
        text=text,
    )


async def run_bot():
    token = settings.telegram_token

    if not token:
        raise RuntimeError("Telegram bot token is not configured.")

    if not settings.allowed_user_ids:
        raise RuntimeError(
            "Set OWNER_TELEGRAM_ID in environment variables."
        )

    bot = Bot(token=token)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)

    await bot.set_my_commands([
        BotCommand(command="start", description="Главное меню"),
        BotCommand(command="summary", description="Мой портфель"),
        BotCommand(command="signals", description="Торговые сигналы"),
        BotCommand(command="status", description="Статус системы"),
        BotCommand(command="help", description="Помощь"),
    ])

    logger.info("Telegram bot started.")

    try:
        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
        )
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(run_bot())
    
