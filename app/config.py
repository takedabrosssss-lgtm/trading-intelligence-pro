
import os
from dataclasses import dataclass
from functools import lru_cache


def parse_user_ids(value: str) -> set[str]:
    return {
        item.strip()
        for item in value.split(",")
        if item.strip()
    }


@dataclass(frozen=True)
class Settings:
    environment: str
    bot_token: str
    telegram_webhook_secret: str
    webhook_url: str
    mini_app_url: str
    owner_telegram_id: str
    allowed_telegram_ids: str
    database_url: str
    secret_key: str
    host: str
    port: int

    initial_capital: float
    strategy_capital: float
    max_risk_per_trade: float
    max_drawdown: float

    binance_base_url: str
    bybit_base_url: str

    scan_interval_seconds: int
    request_timeout_seconds: int

    @property
    def telegram_token(self) -> str:
        return self.bot_token

    @property
    def allowed_user_ids(self) -> set[str]:
        ids = parse_user_ids(self.allowed_telegram_ids)

        if self.owner_telegram_id:
            ids.add(self.owner_telegram_id)

        return ids


@lru_cache
def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("ENVIRONMENT", "production"),
        bot_token=os.getenv(
            "BOT_TOKEN",
            os.getenv("TELEGRAM_BOT_TOKEN", ""),
        ),
        telegram_webhook_secret=os.getenv(
            "TELEGRAM_WEBHOOK_SECRET", ""
        ),
        webhook_url=os.getenv("WEBHOOK_URL", ""),
        mini_app_url=os.getenv("MINI_APP_URL", ""),
        owner_telegram_id=os.getenv("OWNER_TELEGRAM_ID", ""),
        allowed_telegram_ids=os.getenv("ALLOWED_TELEGRAM_IDS", ""),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./trading_intelligence.db"),
        secret_key=os.getenv("SECRET_KEY", ""),
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        initial_capital=10000.0,
        strategy_capital=2500.0,
        max_risk_per_trade=0.015,
        max_drawdown=0.10,
        binance_base_url="https://data-api.binance.vision",
        bybit_base_url="https://api.bybit.com",
        scan_interval_seconds=300,
        request_timeout_seconds=15,
    )


settings = get_settings()
