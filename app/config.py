
import os
from functools import lru_cache


class Settings:
    APP_NAME = "Trading Intelligence PRO"
    APP_VERSION = "2.0.0"
    ENVIRONMENT = os.getenv("ENVIRONMENT", "production")

    # Telegram
    BOT_TOKEN = os.getenv("BOT_TOKEN", "")
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")
    MINI_APP_URL = os.getenv("MINI_APP_URL", "")

    # Personal access control
    OWNER_TELEGRAM_ID = os.getenv("OWNER_TELEGRAM_ID", "")
    ALLOWED_TELEGRAM_IDS = os.getenv("ALLOWED_TELEGRAM_IDS", "")

    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./trading_intelligence.db")

    # Server
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "8000"))

    # Paper trading
    INITIAL_CAPITAL = float(os.getenv("INITIAL_CAPITAL", "10000"))
    STRATEGY_CAPITAL = float(os.getenv("STRATEGY_CAPITAL", "2500"))
    MAX_RISK_PER_TRADE = float(os.getenv("MAX_RISK_PER_TRADE", "0.015"))
    MAX_DRAWDOWN = float(os.getenv("MAX_DRAWDOWN", "0.10"))

    # Market data providers
    BINANCE_BASE_URL = os.getenv(
        "BINANCE_BASE_URL",
        "https://api.binance.com"
    )
    BYBIT_BASE_URL = os.getenv(
        "BYBIT_BASE_URL",
        "https://api.bybit.com"
    )

    # Scanner
    SCAN_INTERVAL_SECONDS = int(
        os.getenv("SCAN_INTERVAL_SECONDS", "300")
    )
    MARKET_DATA_TIMEOUT = float(
        os.getenv("MARKET_DATA_TIMEOUT", "12")
    )

    # Security
    SECRET_KEY = os.getenv("SECRET_KEY", "")

    @property
    def telegram_token(self):
        return self.BOT_TOKEN or self.TELEGRAM_BOT_TOKEN

    @property
    def allowed_user_ids(self):
        values = set()

        if self.OWNER_TELEGRAM_ID.strip():
            values.add(self.OWNER_TELEGRAM_ID.strip())

        for value in self.ALLOWED_TELEGRAM_IDS.split(","):
            value = value.strip()
            if value:
                values.add(value)

        return values


@lru_cache
def get_settings():
    return Settings()


settings = get_settings()
